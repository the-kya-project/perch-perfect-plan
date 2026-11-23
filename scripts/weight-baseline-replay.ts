// Replays an exported copy of real weight history through the baseline rules
// (backlog D1.1) and prints how often each tier would have fired, per bird.
//
//   npm run weight-baseline:replay -- <export.csv | export.json>
//
// Make the export with docs/reports/weight-history-export.sql (read-only, no
// names: the bird is an opaque key). Keep the export and the report off the
// repo; they're for Brittany and the vet only.
import { readFileSync } from "node:fs";
import { formatReplay, parseHistory, replayHistory } from "@/lib/weightBaselineReplay";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run weight-baseline:replay -- <export.csv | export.json>");
  process.exit(1);
}
process.stdout.write(formatReplay(replayHistory(parseHistory(readFileSync(file, "utf8")))));
