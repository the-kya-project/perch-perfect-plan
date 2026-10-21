// npm run test:bird-names — the one bird-list rule (src/lib/birdNames.ts).
import { birdNames } from "../src/lib/birdNames";

// A stand-in for i18next's t(): fills {{placeholders}} in the English default
// and picks a plural for {{count}} the way the catalog does.
const t = ((_key: string, def: string, vars: Record<string, unknown> = {}) =>
  def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""))) as any;

const cases: Array<[string[], string]> = [
  [[], ""],
  [["Echo"], "Echo"],
  [["Echo", "Buzz"], "Echo and Buzz"],
  [["Echo", "Buzz", "Max"], "Echo, Buzz, and Max"],
  [["Echo", "Buzz", "Max", "Kiwi"], "4 birds"],
  [["Echo", "", "Buzz"], "Echo and Buzz"],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = birdNames(t, input);
  if (got !== want) { failed++; console.error(`✗ ${JSON.stringify(input)} → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log(`${cases.length} passed`);
