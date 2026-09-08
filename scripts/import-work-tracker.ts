// Input is a read-only extraction of the supplied workbook, not executable workbook content.
// Prepare a reviewable plan from a backup; apply only through the authenticated application API.
import { readFileSync, writeFileSync } from "node:fs";
import { importWorkTracker, type TrackerSheet } from "../lib/tracker-import";
import { registrySaveSchema, ordered, today, type Store } from "../lib/model";
const [sourcePath, backupPath, outputPath] = process.argv.slice(2);
if (!sourcePath || !backupPath || !outputPath)
  throw new Error(
    "Usage: tsx scripts/import-work-tracker.ts SOURCE_JSON BACKUP_JSON PLAN_JSON",
  );
const source = JSON.parse(readFileSync(sourcePath, "utf8")) as Record<
  string,
  TrackerSheet
>;
const store = JSON.parse(readFileSync(backupPath, "utf8")).state
  .payload as Store;
const file = "Трекер_услуг_портала.xlsx";
const result = importWorkTracker(store.services, source["Трекер"], file);
const input = registrySaveSchema.parse({
  revision: store.revision,
  date: today(),
  note: `Импорт ${file}: ${result.sourceRows} строк «В работе», ${result.added} новых услуг, ${result.enriched} существующих дополнены. Текущие статусы существующих услуг сохранены.`,
  metrics: ordered(store.snapshots).at(-1)!.metrics,
  services: result.services,
});
const summary = {
  sourceRows: result.sourceRows,
  uniqueServices: result.uniqueServices,
  added: result.added,
  enriched: result.enriched,
  changed: result.changed,
  metrics: input.metrics,
};
writeFileSync(
  outputPath,
  JSON.stringify({ summary, input, report: result.report }, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(summary));
