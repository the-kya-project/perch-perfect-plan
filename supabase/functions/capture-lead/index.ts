// capture-lead — Supabase Edge Function (Brevo)
// Captures a marketing lead and creates/updates a contact in Brevo.
//
// Project: koyqdyamazuuwvqbttnj (The Kya Project's own Supabase)
//
// Secrets to set in Supabase (Edge Functions -> Manage -> Secrets):
//   BREVO_API_KEY   required, server-only, never exposed to the client
//   BREVO_LIST_ID   the numeric ID of the Brevo list for consenting contacts
//
// One-time Brevo setup:
//   Create a text contact attribute named SOURCE
//   (Contacts -> Settings -> Contact attributes). Without it, Brevo rejects
//   the request. FIRSTNAME and LASTNAME already exist by default.
//
// Consent handling:
//   Contacts who consent are added to the marketing opt-in list.
//   Contacts who do not consent are still saved as contacts, but are
//   not added to the list. Nobody is blacklisted.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_URL = "https://api.brevo.com/v3/contacts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Brevo date-type attributes expect YYYY-MM-DD, not free text.
function toBrevoDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let payload: {
    email?: unknown;
    name?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    source?: unknown;
    marketingConsent?: unknown;
    attribution?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email) {
    return json(400, { error: "email is required" });
  }
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  let firstName = typeof payload.firstName === "string" ? payload.firstName.trim() : "";
  let lastName = typeof payload.lastName === "string" ? payload.lastName.trim() : "";
  // Fallback: if only a single name came through, split it on the first space.
  if (!firstName && !lastName && name) {
    const firstSpace = name.indexOf(" ");
    firstName = firstSpace === -1 ? name : name.slice(0, firstSpace);
    lastName = firstSpace === -1 ? "" : name.slice(firstSpace + 1);
  }
  const source = typeof payload.source === "string" ? payload.source : "";
  const marketingConsent = Boolean(payload.marketingConsent);

  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    console.error("capture-lead: BREVO_API_KEY is not configured");
    return json(500, { error: "Server is not configured" });
  }

  const attributes: Record<string, unknown> = {
    FIRSTNAME: firstName,
    LASTNAME: lastName,
    SOURCE: source,
  };

  // First-touch signup attribution → existing Brevo custom attributes. Names are
  // case-sensitive and must match the attributes already created in Brevo; a
  // mismatch silently fails to populate. SIGNUP_DATE is a Brevo date attribute.
  const a = payload.attribution;
  if (a && typeof a === "object") {
    const at = a as Record<string, unknown>;
    attributes.SIGNUP_SOURCE = str(at.source) || "direct";
    attributes.SIGNUP_MEDIUM = str(at.medium);
    attributes.SIGNUP_CAMPAIGN = str(at.campaign);
    attributes.SIGNUP_TERM = str(at.term);
    attributes.SIGNUP_CONTENT = str(at.content);
    attributes.SIGNUP_REFERRER = str(at.referrer);
    attributes.SIGNUP_LANDING_PAGE = str(at.landing_page);
    const signupDate = toBrevoDate(str(at.first_seen_at));
    if (signupDate) attributes.SIGNUP_DATE = signupDate; // omit if unparseable so the date attr isn't rejected
  }

  const contact: Record<string, unknown> = {
    email,
    updateEnabled: true, // re-submits update the contact instead of erroring
    attributes,
  };

  // Only add consenting contacts to the marketing list.
  const listIdRaw = Deno.env.get("BREVO_LIST_ID");
  const listId = listIdRaw ? Number(listIdRaw) : NaN;
  if (marketingConsent && !Number.isNaN(listId)) {
    contact.listIds = [listId];
  }

  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(contact),
    });
    // 201 = created, 204 = updated; both are success.
    if (!res.ok) {
      const text = await res.text();
      console.error("capture-lead: Brevo error", res.status, text);
      return json(502, { error: "Brevo rejected the request" });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error("capture-lead: network error", err);
    return json(502, { error: "Could not reach Brevo" });
  }
});
