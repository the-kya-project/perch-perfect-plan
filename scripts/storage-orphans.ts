/**
 * Find (and, only when told to, delete) files left in Supabase Storage after
 * their account or bird was deleted. Rules: src/lib/storageOrphans.ts.
 *
 * DRY RUN is the default: it lists every file it would delete (bucket, path,
 * size, upload date) and deletes nothing.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx vite-node scripts/storage-orphans.ts [--out plan.json]
 *
 * It reads the live state at run time: every object in every bucket (through
 * the Storage API), every account (Auth admin API), every bird, and every
 * column that can point at a file. Nothing is cached between runs.
 *
 * Delete, after someone has approved a dry run's list:
 *
 *   … npx vite-node scripts/storage-orphans.ts --delete --approved plan.json --confirm-project <ref>
 *
 * It runs the whole check again first and deletes only files that are on the
 * approved list AND still orphans now, through the Storage API (never SQL;
 * Storage also refuses direct SQL deletes). --confirm-project must match the
 * project in SUPABASE_URL.
 *
 * Offline: --snapshot <file.json> plans from an exported snapshot
 * ({ objects, liveAccountIds, liveBirdIds, references }) instead of the live
 * project, read-only. --print-snapshot-sql prints the SQL that exports one.
 * A snapshot can never delete.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  OWNER_KEY, REFERENCE_COLUMNS, approvedStillOrphaned, findOrphans, formatBytes,
  type OrphanPlan, type StoredObject,
} from "@/lib/storageOrphans";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

// ---- Reading the live project -------------------------------------------------------

const PAGE = 1000;

async function listBucket(sb: SupabaseClient, bucket: string): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  const queue = [""];
  let folders = 0;
  while (queue.length) {
    const dir = queue.shift()!;
    if (++folders > 50_000) throw new Error(`${bucket}: more than 50,000 folders; stopping`);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await sb.storage.from(bucket).list(dir, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`${bucket}/${dir}: list failed: ${error.message}`);
      for (const row of data ?? []) {
        const full = dir ? `${dir}/${row.name}` : row.name;
        if (row.id == null) queue.push(full);
        else out.push({ bucket, name: full, size: Number((row.metadata as any)?.size ?? 0), createdAt: row.created_at ?? null });
      }
      if ((data ?? []).length < PAGE) break;
    }
  }
  return out;
}

async function liveState(sb: SupabaseClient) {
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  const objects: StoredObject[] = [];
  for (const b of buckets ?? []) objects.push(...(await listBucket(sb, b.id)));

  const liveAccountIds: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error: e } = await sb.auth.admin.listUsers({ page, perPage: PAGE });
    if (e) throw new Error(`listUsers failed: ${e.message}`);
    liveAccountIds.push(...data.users.map((u) => u.id));
    if (data.users.length < PAGE) break;
  }

  const readAll = async (table: string, column: string): Promise<any[]> => {
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error: e } = await sb.from(table).select(column).range(from, from + PAGE - 1);
      if (e) throw new Error(`${table}.${column} read failed: ${e.message}`);
      rows.push(...(data ?? []).map((r: any) => r[column]));
      if ((data ?? []).length < PAGE) break;
    }
    return rows;
  };
  const liveBirdIds = await readAll("birds", "id");
  const references: string[] = [];
  for (const c of REFERENCE_COLUMNS) {
    for (const v of await readAll(c.table, c.column)) {
      // Inline images (data: URLs, from before uploads) can't point at a file.
      if (Array.isArray(v)) references.push(...v.filter((x) => typeof x === "string" && !x.startsWith("data:")));
      else if (typeof v === "string" && !v.startsWith("data:")) references.push(v);
    }
  }
  return { objects, liveAccountIds, liveBirdIds, references };
}

// ---- The snapshot export (read-only SQL) ----------------------------------------

function snapshotSql(): string {
  const refs = REFERENCE_COLUMNS.map((c) => c.array
    ? `select unnest(${c.column}) as v from public.${c.table}`
    : `select ${c.column} as v from public.${c.table}`).join("\n    union all ");
  return `-- Read-only. Exports what scripts/storage-orphans.ts --snapshot needs.
select json_build_object(
  'objects', (select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name,
                'size', coalesce((metadata->>'size')::bigint, 0), 'createdAt', created_at)), '[]') from storage.objects),
  'liveAccountIds', (select coalesce(json_agg(id), '[]') from auth.users),
  'liveBirdIds', (select coalesce(json_agg(id), '[]') from public.birds),
  'references', (select coalesce(json_agg(v), '[]') from (
    ${refs}
  ) r where v is not null and v not like 'data:%')
) as snapshot;`;
}

// ---- Output ---------------------------------------------------------------------------

function report(plan: OrphanPlan, source: string) {
  console.log(`Source: ${source}`);
  console.log(`Checked ${plan.checked} files. Owner-keyed buckets: ${Object.keys(OWNER_KEY).join(", ")}.\n`);
  const total = plan.orphans.reduce((n, o) => n + o.size, 0);
  console.log(`Would delete ${plan.orphans.length} file(s), ${formatBytes(total)}:`);
  for (const o of plan.orphans) {
    console.log(`  ${o.bucket.padEnd(20)} ${o.name.padEnd(72)} ${formatBytes(o.size).padStart(8)}  ${(o.createdAt ?? "").slice(0, 10)}`);
  }
  if (plan.protectedByReference.length) {
    console.log(`\nKept: owner gone but a row still points at it (${plan.protectedByReference.length}):`);
    for (const o of plan.protectedByReference) console.log(`  ${o.bucket} ${o.name}`);
  }
  if (plan.skipped.length) {
    console.log("\nLeft alone:");
    for (const s of plan.skipped) console.log(`  ${s.bucket}: ${s.count} file(s), ${s.reason}`);
  }
}

// ---- Main -----------------------------------------------------------------------------

async function main() {
  if (flag("--print-snapshot-sql")) { console.log(snapshotSql()); return; }

  const snapshotFile = value("--snapshot");
  if (snapshotFile) {
    if (flag("--delete")) throw new Error("A snapshot can't delete. Run against the live project.");
    const snap = JSON.parse(readFileSync(snapshotFile, "utf8"));
    const plan = findOrphans(snap);
    report(plan, `snapshot ${snapshotFile} (read-only)`);
    const out = value("--out");
    if (out) writeFileSync(out, JSON.stringify({ source: snapshotFile, orphans: plan.orphans }, null, 2));
    console.log("\nDry run: nothing was deleted.");
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --snapshot).");
  const ref = new URL(url).hostname.split(".")[0];
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const plan = findOrphans(await liveState(sb));
  report(plan, `live project ${ref}`);

  if (!flag("--delete")) {
    const out = value("--out");
    if (out) {
      writeFileSync(out, JSON.stringify({ project: ref, at: new Date().toISOString(), orphans: plan.orphans }, null, 2));
      console.log(`\nSaved the list to ${out}. Approve it, then run with --delete --approved ${out} --confirm-project ${ref}.`);
    }
    console.log("\nDry run: nothing was deleted.");
    return;
  }

  if (value("--confirm-project") !== ref) throw new Error(`Refusing: --confirm-project must be ${ref}.`);
  const approvedFile = value("--approved");
  if (!approvedFile) throw new Error("Refusing: --delete needs --approved <the dry run's saved list>.");
  const approved = JSON.parse(readFileSync(approvedFile, "utf8"));
  if (approved.project !== ref) throw new Error(`Refusing: ${approvedFile} was made for ${approved.project}, not ${ref}.`);
  const targets = approvedStillOrphaned(approved.orphans ?? [], plan.orphans);
  const dropped = (approved.orphans ?? []).length - targets.length;
  console.log(`\nDeleting ${targets.length} approved file(s) that are still orphans${dropped ? ` (${dropped} approved file(s) are no longer orphans and are kept)` : ""}.`);

  let deleted = 0;
  const byBucket = new Map<string, string[]>();
  for (const t of targets) byBucket.set(t.bucket, [...(byBucket.get(t.bucket) ?? []), t.name]);
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += 100) {
      const chunk = names.slice(i, i + 100);
      const { data, error } = await sb.storage.from(bucket).remove(chunk);
      if (error) { console.error(`  ${bucket}: remove failed for ${chunk.length} file(s): ${error.message}`); continue; }
      deleted += (data ?? []).length;
    }
  }
  console.log(`Deleted ${deleted} of ${targets.length}.`);
  if (deleted !== targets.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
