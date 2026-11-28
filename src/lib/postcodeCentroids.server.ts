// A ZIP or postcode → the middle of its area (backlog D2.2), from files in the
// app, so no outside service ever sees the ZIP itself. Server only.
//
//   US: the Census Bureau's ZIP Code Tabulation Areas (Gazetteer file,
//       INTPTLAT / INTPTLONG, the area's internal point).
//   NL: the public 4-digit postcode areas.
//
// Both files are built by `npm run weather:postcodes` (scripts/postcode-
// centroids.ts) from the published sources, rounded to 2 decimals (about a
// kilometre), as { "<postcode>": [lat, lon] }. A postcode missing from the file
// gives null, and Home shows the seasonal card as usual.
//
// The JSON is imported dynamically, so it's read only on the server, only once
// per warm instance, and never reaches a browser bundle.
import type { HomePostcode } from "@/lib/weatherCards";

type CentroidTable = Record<string, [number, number]>;

const tables: Partial<Record<HomePostcode["country"], Promise<CentroidTable>>> = {};

function load(country: HomePostcode["country"]): Promise<CentroidTable> {
  tables[country] ??= (
    country === "US"
      ? import("@/data/postcode-centroids/us.json")
      : import("@/data/postcode-centroids/nl.json")
  ).then((m) => ((m as { default?: unknown }).default ?? m) as CentroidTable);
  return tables[country]!;
}

export async function centroidFor(home: HomePostcode): Promise<{ lat: number; lon: number } | null> {
  const table = await load(home.country);
  const hit = table[home.postcode];
  if (!Array.isArray(hit) || hit.length !== 2) return null;
  const [lat, lon] = hit;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}
