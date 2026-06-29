// One-off, idempotent backfill: move base64 scan photos out of Postgres into the
// private scan-photos Storage bucket, replacing photo_logs.photo_url with the
// object path. Needs the Storage API, so it's a script (not a SQL migration).
//
// Run the bucket migration (20260628110000_scan_photos_bucket.sql) FIRST.
//
// Usage (from repo root):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-scan-photos.mjs           # dry run (default)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-scan-photos.mjs --apply    # actually migrate
//
// Safety:
//  - Idempotent: only touches rows whose photo_url is a base64 data: URL; skips
//    rows already migrated to a path. Safe to re-run.
//  - Per row: uploads to Storage FIRST, and only on a confirmed upload does it
//    replace the base64 with the path (guarded by `.like('photo_url','data:%')`,
//    so a concurrent migrate can't double-write). A failed upload leaves the
//    base64 untouched — nothing is cleared until it's safely in Storage.
//  - Dry run by default: reports counts without writing anything.

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const BUCKET = "scan-photos";
const PAGE = 25; // base64 rows are large — keep batches small

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

function decodeDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const mime = /data:([^;]+)/.exec(dataUrl.slice(0, comma))?.[1] ?? "image/jpeg";
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return { mime, buf };
}

let migrated = 0, skipped = 0, failed = 0;

async function run() {
  console.log(`[backfill-scan-photos] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
  for (;;) {
    // Always read the head of the remaining base64 rows. In APPLY mode each fixed
    // row drops out of this filter, so the window advances without an offset.
    const { data: rows, error } = await sb
      .from("photo_logs")
      .select("id, bird_id, photo_url")
      .like("photo_url", "data:%")
      .order("created_at", { ascending: true })
      .limit(PAGE);
    if (error) { console.error("query failed:", error.message); process.exit(1); }
    if (!rows?.length) break;

    for (const r of rows) {
      if (typeof r.photo_url !== "string" || !r.photo_url.startsWith("data:")) { skipped++; continue; }
      if (!APPLY) { migrated++; continue; } // dry run: count what WOULD migrate

      const decoded = decodeDataUrl(r.photo_url);
      if (!decoded) { console.warn(`  ! ${r.id}: unparseable data URL`); failed++; continue; }
      const path = `${r.bird_id}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, decoded.buf, { contentType: decoded.mime, upsert: false });
      if (up.error) { console.warn(`  ! ${r.id}: upload failed — ${up.error.message}`); failed++; continue; }

      // Only clear the base64 after a confirmed upload; guard prevents double-write.
      const upd = await sb.from("photo_logs").update({ photo_url: path }).eq("id", r.id).like("photo_url", "data:%");
      if (upd.error) {
        console.warn(`  ! ${r.id}: row update failed — ${up.error?.message ?? upd.error.message}; removing orphan object`);
        await sb.storage.from(BUCKET).remove([path]).catch(() => {});
        failed++; continue;
      }
      migrated++;
    }

    // Dry run doesn't mutate, so the same rows would return forever — stop after
    // one representative read once we've counted at least a full page.
    if (!APPLY) break;
  }

  if (!APPLY) {
    // Count the full backlog for the dry-run report.
    const { count } = await sb.from("photo_logs").select("id", { count: "exact", head: true }).like("photo_url", "data:%");
    console.log(`[backfill-scan-photos] DRY-RUN: ${count ?? 0} base64 row(s) would be migrated. Re-run with --apply.`);
  } else {
    console.log(`[backfill-scan-photos] done. migrated=${migrated} skipped=${skipped} failed=${failed}`);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
