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
//
// Abuse hardening (public, unauthenticated endpoint):
//   - CORS restricted to the app's own origins (the only legitimate caller is
//     the signup flow via supabase.functions.invoke). The community waitlist
//     uses a different path (joinWaitlist -> Brevo form), so it's unaffected.
//   - Email is format- and length-validated; name/source lengths are capped.
//   - Per-IP in-memory sliding-window throttle stops trivial scripted spam.
//     (Edge isolates don't share memory, so it's per-warm-instance — a
//     distributed/IP-rotating attacker isn't fully stopped; Cloudflare Turnstile
//     on the form is the stronger post-launch control. CORS is browser-enforced
//     and does NOT stop curl, which is exactly why the rate limit exists.)

// ---- CORS allowlist ----------------------------------------------------------
const ALLOWED_EXACT = new Set<string>([
  "https://app.thekyaproject.com",
]);
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_EXACT.has(origin)) return true;
  try {
    const u = new URL(origin);
    // This project's Vercel preview/branch deploys.
    if (u.protocol === "https:" && u.hostname.endsWith(".vercel.app") && u.hostname.startsWith("pet-sitter")) return true;
    // Local development (dev server hits the deployed function). A malicious site
    // can't forge Origin, so allowing localhost doesn't widen the real attack
    // surface; it only lets the maintainer test lead capture locally.
    if ((u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  } catch { /* not a valid URL → not allowed */ }
  return false;
}
function corsHeadersFor(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin as string;
  return h;
}

// ---- Per-IP rate limit (in-memory sliding window) ----------------------------
const RL_WINDOW_MS = 60_000;
const RL_MAX = 8; // generous: a real person submits once; scripts get throttled
const hits = new Map<string, number[]>();
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Bound memory if an attacker rotates IPs: drop fully-expired buckets.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RL_WINDOW_MS)) hits.delete(k);
  }
  return recent.length > RL_MAX;
}

// ---- Input validation --------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (e: string) => e.length <= 254 && EMAIL_RE.test(e);
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const BREVO_URL = "https://api.brevo.com/v3/contacts";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Brevo date-type attributes expect YYYY-MM-DD, not free text.
function toBrevoDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeadersFor(origin);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Throttle before doing any work.
  if (rateLimited(clientIp(req))) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...cors, "Content-Type": "application/json", "Retry-After": "60" },
    });
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
  if (!isValidEmail(email)) {
    return json(400, { error: "A valid email is required" });
  }
  const name = cap(typeof payload.name === "string" ? payload.name.trim() : "", 200);
  let firstName = cap(typeof payload.firstName === "string" ? payload.firstName.trim() : "", 100);
  let lastName = cap(typeof payload.lastName === "string" ? payload.lastName.trim() : "", 100);
  // Fallback: if only a single name came through, split it on the first space.
  if (!firstName && !lastName && name) {
    const firstSpace = name.indexOf(" ");
    firstName = firstSpace === -1 ? name : name.slice(0, firstSpace);
    lastName = firstSpace === -1 ? "" : name.slice(firstSpace + 1);
  }
  const source = cap(typeof payload.source === "string" ? payload.source : "", 100);
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
  // BREVO_LIST_ID (Edge Function secret) is the numeric id of THE marketing
  // opt-in list in Brevo — verified 2026-07-02 that consenting signups land in
  // it. If it's ever missing or non-numeric, that's a config error: log it
  // loudly instead of silently creating contacts that never reach the list.
  const addToList = marketingConsent && !Number.isNaN(listId);
  if (addToList) {
    contact.listIds = [listId];
  } else if (marketingConsent) {
    console.error("capture-lead: marketingConsent=true but BREVO_LIST_ID is missing/non-numeric — contact will NOT be added to the marketing list");
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
    // Success log so list additions are visible in the function logs. Email is
    // masked (first char + domain) — no full PII in logs.
    const maskedEmail = `${email[0]}***@${email.split("@")[1] ?? ""}`;
    console.log(`capture-lead: ok email=${maskedEmail} source=${source || "unknown"} consent=${marketingConsent} list=${addToList ? listId : "none"}`);
    return json(200, { ok: true });
  } catch (err) {
    console.error("capture-lead: network error", err);
    return json(502, { error: "Could not reach Brevo" });
  }
});
