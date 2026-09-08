import { createHash } from "node:crypto";
import { serviceSchema, type Service } from "./model";
import type { ServiceWork } from "./work";

type Cell = string | number | null;
export type TrackerSheet = Cell[][];
const normalize = (name: string) =>
  name
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^а-яa-z0-9]/g, "");
const aliases: Record<string, string> = {
  [normalize("Регистрация ИП")]: normalize(
    "Регистрация индивидуального предпринимателя",
  ),
  [normalize(
    "Расторжение брака супругов, не имеющих общих несовершеннолетних детей",
  )]: normalize(
    "Государственная регистрация расторжения брака супругов, не имеющих общих несовершеннолетних детей",
  ),
};
const identity = (name: string) => aliases[normalize(name)] ?? normalize(name);
const value = (cell: Cell | undefined) => (cell == null ? "" : String(cell));
const join = (a: string | undefined, b: string) =>
  !b || a === b ? (a ?? "") : a ? `${a}\n\n${b}` : b;

/** Read only the work queue. Repeated registry IDs are NOT identity keys: they include subservices. */
export function importWorkTracker(
  current: Service[],
  sheet: TrackerSheet,
  file: string,
) {
  const expected = [
    "№",
    "ID реестра",
    "Точность ID",
    "Услуга (как в работе)",
    "Услуга по реестру",
    "Ведомство",
    "Состояние",
  ];
  if (expected.some((h, i) => sheet[0]?.[i] !== h))
    throw new Error("Не совпадают заголовки трекера.");
  const services = structuredClone(current);
  const report: {
    row: number;
    serviceId: string;
    name: string;
    action: string;
  }[] = [];
  const originalIds = new Set(current.map((s) => s.id));
  const changed = new Set<string>();
  for (let index = 1; index < sheet.length; index++) {
    const row = sheet[index];
    if (
      !["В работе", "В работе (нет в док. по порталу)"].includes(value(row[6]))
    )
      continue;
    const name = value(row[3]);
    if (!name) throw new Error(`Нет названия в строке ${index + 1}`);
    const matches = services.filter((s) => identity(s.name) === identity(name));
    if (matches.length > 1)
      throw new Error(`Неоднозначное совпадение: строка ${index + 1}, ${name}`);
    const existing = matches[0];
    const id =
      existing?.id ??
      `TRK-${createHash("sha256").update(identity(name)).digest("hex").slice(0, 24)}`;
    const source = {
      file,
      sheet: "Трекер",
      row: index + 1,
      cells: Object.fromEntries(
        row.map((cell, i) => [
          value(sheet[0][i]) || `Без заголовка (${i + 1})`,
          cell == null ? null : String(cell),
        ]),
      ),
    };
    const oldSource = existing?.work?.sources?.find(
      (s) => s.file === file && s.sheet === "Трекер" && s.row === index + 1,
    );
    if (oldSource) {
      if (JSON.stringify(oldSource) !== JSON.stringify(source))
        throw new Error(
          `Строка ${index + 1} изменилась после импорта; нужна повторная сверка.`,
        );
      report.push({
        row: index + 1,
        serviceId: id,
        name,
        action: "alreadyImported",
      });
      continue;
    }
    const work: ServiceWork = { ...existing?.work };
    const mapping = {
      todo: 10,
      state: 6,
      agency: 5,
      responsible: 11,
      owner: 9,
      deadline: 7,
      revisedDeadline: 18,
    } as const;
    for (const [key, column] of Object.entries(mapping))
      work[key as keyof typeof mapping] = join(
        work[key as keyof typeof mapping],
        value(row[column]),
      );
    // The unnamed U column contains additional comments in two source rows.
    work.comment = join(
      work.comment,
      [value(row[19]), value(row[20])].filter(Boolean).join("\n\n"),
    );
    work.sources = [...(work.sources ?? []), source];
    const next = serviceSchema.parse(
      existing
        ? { ...existing, work }
        : {
            id,
            name,
            status: "progress",
            audience: "unknown",
            work,
            ...(row[12] === "Не имеет оплаты" ? { payment: "free" } : {}),
          },
    );
    if (existing) services[services.indexOf(existing)] = next;
    else services.push(next);
    changed.add(id);
    report.push({
      row: index + 1,
      serviceId: id,
      name,
      action: originalIds.has(id) ? "enriched" : "added",
    });
  }
  return {
    services,
    report,
    added: services.length - current.length,
    enriched: [...changed].filter((id) => originalIds.has(id)).length,
    changed: changed.size,
    sourceRows: report.length,
    uniqueServices: new Set(report.map((r) => r.serviceId)).size,
  };
}
