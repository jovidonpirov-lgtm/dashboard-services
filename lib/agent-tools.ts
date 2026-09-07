import { z } from "zod";
import { visibleMetrics, compare, ordered, type Store } from "./model";
export type ModelContext = {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
};
const periodSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .strict()
  .refine(
    (v) => v.from <= v.to,
    "Дата начала должна быть не позже даты окончания.",
  );
/** Exposes only the currently visible dataset: examples for guests, real data after login. */
export function registerAnalysisTools(
  context: ModelContext | undefined,
  read: () => { store: Store; demo: boolean },
) {
  const lifecycle = new AbortController();
  if (!context) return () => lifecycle.abort();
  const tools = [
    {
      name: "read_service_dashboard",
      title: "Прочитать показатели услуг",
      description:
        "Read the current visible service metrics and their actual report date. Demo data is explicitly marked. Does not change reports.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) {
        z.object({}).strict().parse(input);
        const { store, demo } = read();
        const latest = ordered(store.snapshots).at(-1);
        return {
          demo,
          reportDate: latest?.date ?? null,
          metrics: latest ? visibleMetrics(latest.metrics) : null,
          registeredServices: store.services.length,
        };
      },
    },
    {
      name: "compare_service_period",
      title: "Сравнить показатели за период",
      description:
        "Read service count changes between inclusive dates using the last report BEFORE the start date as baseline. Returns null change when the baseline is missing. Does not change visible filters or reports.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", format: "date" },
          to: { type: "string", format: "date" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) {
        const { from, to } = periodSchema.parse(input);
        const { store, demo } = read();
        const result = compare(store.snapshots, from, to);
        return {
          demo,
          from,
          to,
          baselineDate: result.baseline?.date ?? null,
          endReportDate: result.end?.date ?? null,
          change: result.delta,
        };
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Unsupported experimental context must not prevent ordinary use. */
    }
  }
  return () => lifecycle.abort();
}
