/**
 * Builds the ZIP and postcode → middle-of-area files for the weather cards
 * (backlog D2.2): src/data/postcode-centroids/us.json and nl.json, read only
 * by src/lib/postcodeCentroids.server.ts.
 *
 *   npm run weather:postcodes -- --us <gazetteer.txt> --nl <pc4.csv>
 *
 * Either flag may be given alone; a file not named is left as it is.
 *
 *   --us  The Census Bureau's ZCTA Gazetteer file (public domain), unzipped:
 *         https://www2.census.gov/geo/docs/maps-data/data/gazetteer/<year>_Gazetteer/<year>_Gaz_zcta_national.zip
 *         Tab-separated, with GEOID, INTPTLAT and INTPTLONG columns (the
 *         area's internal point).
 *   --nl  The public 4-digit postcode areas, as a CSV or TSV with a header
 *         naming the postcode column (postcode, pc4 or postcode4) and the
 *         middle's coordinates (lat or latitude; lon, lng or longitude), in
 *         WGS84 degrees.
 *         nl.json comes from GeoNames (geonames.org), CC BY 4.0, downloaded Nov 28, 2026.
 *
 * Coordinates are rounded to 2 decimals (about a kilometre), which is all a
 * forecast needs and keeps the files small. Postcodes that don't fit the
 * app's rules (parseHomePostcode) are skipped and counted.
 */
import { readFileSync, writeFileSync } from "node:fs";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function rows(path: string): { header: string[]; lines: string[][] } {
  const raw = readFileSync(path, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const all = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = all[0].includes("\t") ? "\t" : all[0].includes(";") ? ";" : ",";
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  return { header: split(all[0]).map((h) => h.toLowerCase()), lines: all.slice(1).map(split) };
}

function column(header: string[], names: string[], file: string): number {
  const i = header.findIndex((h) => names.includes(h));
  if (i < 0) throw new Error(`${file}: no ${names.join(" / ")} column (header: ${header.join(", ")})`);
  return i;
}

function build(path: string, pattern: RegExp, cols: { code: string[]; lat: string[]; lon: string[] }, pad?: number) {
  const { header, lines } = rows(path);
  const ci = column(header, cols.code, path);
  const la = column(header, cols.lat, path);
  const lo = column(header, cols.lon, path);
  const out: Record<string, [number, number]> = {};
  let skipped = 0;
  for (const l of lines) {
    const code = pad ? l[ci].padStart(pad, "0") : l[ci];
    const lat = Number(l[la]);
    const lon = Number(l[lo]);
    if (!pattern.test(code) || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      skipped++;
      continue;
    }
    out[code] = [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100];
  }
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  return { table: sorted, count: Object.keys(sorted).length, skipped };
}

const us = arg("--us");
const nl = arg("--nl");
if (!us && !nl) {
  console.error("Give --us <gazetteer.txt> and/or --nl <pc4.csv>. See the top of scripts/postcode-centroids.ts.");
  process.exit(1);
}
if (us) {
  const r = build(us, /^(?!00000)\d{5}$/, { code: ["geoid"], lat: ["intptlat"], lon: ["intptlong"] }, 5);
  writeFileSync("src/data/postcode-centroids/us.json", JSON.stringify(r.table) + "\n");
  console.log(`us.json: ${r.count} ZIPs (${r.skipped} skipped)`);
}
if (nl) {
  const r = build(nl, /^[1-9]\d{3}$/, { code: ["postcode", "pc4", "postcode4"], lat: ["lat", "latitude"], lon: ["lon", "lng", "longitude"] });
  writeFileSync("src/data/postcode-centroids/nl.json", JSON.stringify(r.table) + "\n");
  console.log(`nl.json: ${r.count} postcodes (${r.skipped} skipped)`);
}
