// Capture a marketing lead and forward it to Airtable.
// Secrets: AIRTABLE_PAT (server-only, never exposed to the client).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AIRTABLE_URL =
  "https://api.airtable.com/v0/appcZTFqoIwzOSZKr/tblEjFvAjChqsXoiw";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    source?: unknown;
    marketingConsent?: unknown;
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
  const source = typeof payload.source === "string" ? payload.source : "";
  const marketingConsent = Boolean(payload.marketingConsent);

  const token = Deno.env.get("AIRTABLE_PAT");
  if (!token) {
    console.error("capture-lead: AIRTABLE_PAT is not configured");
    return json(500, { error: "Server is not configured" });
  }

  const body = {
    records: [
      {
        fields: {
          fldREdEfNqXzvC4RO: email,
          fldJTgSJIcQOiJg4b: name,
          fldhCYT5bK1GChTzS: source,
          fld8LswRHdoiFvndn: marketingConsent,
          fldVXqJ32t4tEgWqN: new Date().toISOString(),
        },
      },
    ],
    typecast: false,
  };

  try {
    const res = await fetch(AIRTABLE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("capture-lead: Airtable error", res.status, text);
      return json(502, { error: "Airtable rejected the request" });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error("capture-lead: network error", err);
    return json(502, { error: "Could not reach Airtable" });
  }
});
