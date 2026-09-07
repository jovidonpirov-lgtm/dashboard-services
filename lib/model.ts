import { z } from "zod";
export const TIMEZONE = "Asia/Dushanbe";
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftDay(date: string, amount: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
export function dateLabel(date: string, long = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: long ? "long" : "short",
    ...(long ? { year: "numeric" as const } : {}),
  });
}
export const serviceSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(240),
  audience: z.enum(["individual", "business", "both"]),
  status: z.enum(["working", "progress", "planned"]),
});
export type Service = z.infer<typeof serviceSchema>;
const count = z.number().int().min(0).max(1000000);
export const metricsSchema = z
  .object({
    declared: count,
    working: count,
    individual: count,
    business: count,
  })
  .refine((m) => m.working <= m.declared, {
    message: "Работающих услуг не может быть больше заявленных.",
  })
  .refine((m) => m.individual <= m.declared && m.business <= m.declared, {
    message: "Количество услуг по аудитории не может превышать заявленное.",
  })
  .refine((m) => m.individual + m.business >= m.declared, {
    message:
      "Распределите все заявленные услуги по аудиториям. Услуга может относиться к обеим.",
  });
export type Metrics = z.infer<typeof metricsSchema>;
export type Snapshot = {
  id: string;
  date: string;
  createdAt: string;
  note: string;
  metrics: Metrics;
  services: Service[];
};
export type Store = {
  revision: number;
  services: Service[];
  snapshots: Snapshot[];
};
export const saveSchema = z
  .object({
    revision: z.number().int().min(0),
    date: z.iso
      .date()
      .refine((d) => d <= today(), "Нельзя сохранять будущую дату."),
    note: z.string().trim().min(2).max(500),
    metrics: metricsSchema,
    services: z.array(serviceSchema).max(10000),
  })
  .superRefine((data, ctx) => {
    if (
      new Set(data.services.map((s) => s.id.toLowerCase())).size !==
      data.services.length
    )
      ctx.addIssue({
        code: "custom",
        message: "ID услуг должны быть уникальными.",
      });
    if (data.services.length > data.metrics.declared)
      ctx.addIssue({
        code: "custom",
        message: "В реестре больше услуг, чем заявлено.",
      });
    if (
      data.services.filter((s) => s.status !== "working").length >
      data.metrics.declared - data.metrics.working
    )
      ctx.addIssue({
        code: "custom",
        message:
          "В реестре больше незапущенных услуг, чем следует из показателей отчёта.",
      });
    if (
      data.services.filter((s) => s.status === "working").length >
      data.metrics.working
    )
      ctx.addIssue({
        code: "custom",
        message: "В реестре больше работающих услуг, чем в отчёте.",
      });
    if (
      data.services.filter((s) => s.audience !== "business").length >
        data.metrics.individual ||
      data.services.filter((s) => s.audience !== "individual").length >
        data.metrics.business
    )
      ctx.addIssue({
        code: "custom",
        message: "Аудитории услуг в реестре превышают показатели отчёта.",
      });
  });
export const audienceLabels = {
  individual: "Физ. лица",
  business: "Юр. лица",
  both: "Физ. и юр. лица",
};
export const statusLabels = {
  working: "Работает",
  progress: "В разработке",
  planned: "Запланирована",
};
export function ordered(snapshots: Snapshot[]) {
  return [...snapshots].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
}
export function asOf(snapshots: Snapshot[], date: string) {
  return ordered(snapshots)
    .filter((s) => s.date <= date)
    .at(-1);
}
export function compare(snapshots: Snapshot[], from: string, to: string) {
  if (
    !z.iso.date().safeParse(from).success ||
    !z.iso.date().safeParse(to).success ||
    from > to
  )
    return { baseline: undefined, end: undefined, delta: null };
  const baseline = asOf(snapshots, shiftDay(from, -1));
  const end = asOf(snapshots, to);
  return {
    baseline,
    end,
    delta:
      baseline && end
        ? {
            declared: end.metrics.declared - baseline.metrics.declared,
            working: end.metrics.working - baseline.metrics.working,
            individual: end.metrics.individual - baseline.metrics.individual,
            business: end.metrics.business - baseline.metrics.business,
          }
        : null,
  };
}
export function applySave(
  store: Store,
  input: z.infer<typeof saveSchema>,
  id: string,
  createdAt: string,
): Store {
  if (store.revision !== input.revision) throw new Error("CONFLICT");
  const snapshots = [
    ...store.snapshots,
    {
      id,
      createdAt,
      date: input.date,
      note: input.note,
      metrics: input.metrics,
      services: input.services,
    },
  ];
  return {
    revision: store.revision + 1,
    snapshots,
    services: ordered(snapshots).at(-1)!.services,
  };
}
