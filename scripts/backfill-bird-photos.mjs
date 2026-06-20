// One-time backfill: move bird profile photos that were stored inline as base64
// `data:` URLs in birds.photo_url into the private `bird-photos` Storage bucket,
// and replace the column with the object path. The app renders both legacy data
// URLs and Storage paths, so running this is safe and idempotent — it only
// touches rows whose photo_url still starts with "data:".
//
// Usage (run locally, NOT committed-secrets):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node scripts/backfill-bird-photos.mjs
//
// The service-role key bypasses RLS and must never ship to the client. Get it
// from the Supabase dashboard → Project Settings → API → service_role.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function dataUrlToBuffer(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/jpeg";
  return { buffer: Buffer.from(body, "base64"), mime };
}

function extFor(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

async function main() {
  // Page through birds whose photo is still an inline data URL.
  let migrated = 0;
  let failed = 0;
  const PAGE = 50;
  for (;;) {
    const { data: rows, error } = await sb
      .from("birds")
      .select("id, owner_id, photo_url")
      .like("photo_url", "data:%")
      .limit(PAGE);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      try {
        const { buffer, mime } = dataUrlToBuffer(row.photo_url);
        const path = `${row.owner_id}/${crypto.randomUUID()}.${extFor(mime)}`;
        const up = await sb.storage
          .from("bird-photos")
          .upload(path, buffer, { contentType: mime, upsert: false });
        if (up.error) throw up.error;
        const { error: updErr } = await sb.from("birds").update({ photo_url: path }).eq("id", row.id);
        if (updErr) throw updErr;
        migrated++;
        console.log(`✓ ${row.id} → ${path}`);
      } catch (e) {
        failed++;
        console.error(`✗ ${row.id}:`, e.message ?? e);
      }
    }
    // The like-filter keeps matching only un-migrated rows, so the next page is
    // fresh. If every row in a page failed, stop to avoid an infinite loop.
    if (rows.length > 0 && migrated === 0 && failed >= rows.length) break;
  }
  console.log(`\nDone. Migrated ${migrated}, failed ${failed}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
