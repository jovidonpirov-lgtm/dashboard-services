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
export const serviceCategories = [
  "Документы",
  "Транспорт",
  "Справки и выписки",
  "Семья",
  "Налоги и регистрация",
  "Юстиция",
  "Недвижимость",
  "Таможня",
  "Здравоохранение",
  "Связь и почта",
  "Лицензирование",
  "Справочные услуги",
] as const;
export const serviceSchema = z.object({
  id: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((id) => id || crypto.randomUUID()),
  name: z.string().trim().min(2).max(240),
  category: z.enum(serviceCategories).optional(),
  audience: z.enum(["individual", "business", "both"]),
  status: z.enum(["working", "portal", "progress", "planned"]),
});
export type Service = z.infer<typeof serviceSchema>;
const count = z.number().int().min(0).max(1000000);
export const metricsSchema = z
  .object({
    declared: count,
    portal: count.nullable().default(null),
    working: count,
    individual: count,
    business: count,
    both: count.nullable().default(null),
  })
  .refine(
    (m) =>
      m.portal === null || (m.working <= m.portal && m.portal <= m.declared),
    {
      message: "Работают ≤ На портале ≤ Заявлено услуг.",
    },
  )
  .refine(
    (m) =>
      m.both == null ||
      (m.both <= Math.min(m.individual, m.business) &&
        m.individual + m.business - m.both <= m.declared),
    {
      message:
        "Количество услуг по группам Физ, Юр и Физ/Юр не должно превышать заявленное. Проверьте значения групп.",
    },
  )
  .refine((m) => m.working <= m.declared, {
    message: "Работающих услуг не может быть больше заявленных.",
  })
  .refine((m) => m.individual <= m.declared && m.business <= m.declared, {
    message: "Количество услуг по аудитории не может превышать заявленное.",
  });
export type Metrics = z.infer<typeof metricsSchema>;
export function serviceContribution(
  service?: Service,
): Record<keyof Metrics, number> {
  return {
    declared: service ? 1 : 0,
    portal: service && ["working", "portal"].includes(service.status) ? 1 : 0,
    working: service?.status === "working" ? 1 : 0,
    individual: service && service.audience !== "business" ? 1 : 0,
    business: service && service.audience !== "individual" ? 1 : 0,
    both: service?.audience === "both" ? 1 : 0,
  };
}
// Apply only the edited service's difference; existing totals already include the registry.
export function adjustServiceTotals(
  metrics: Metrics,
  before?: Service,
  after?: Service,
): Metrics {
  const old = serviceContribution(before),
    next = serviceContribution(after);
  return Object.fromEntries(
    (Object.keys(next) as (keyof Metrics)[]).map((key) => [
      key,
      metrics[key] == null ? null : metrics[key]! + next[key] - old[key],
    ]),
  ) as Metrics;
}
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
      data.metrics.both != null &&
      data.services.filter((s) => s.audience === "both").length >
        data.metrics.both
    )
      ctx.addIssue({
        code: "custom",
        message: "В реестре больше общих услуг, чем указано в поле «Физ/Юр».",
      });
    if (
      data.metrics.portal != null &&
      data.services.filter(
        (s) => s.status === "working" || s.status === "portal",
      ).length > data.metrics.portal
    )
      ctx.addIssue({
        code: "custom",
        message: "В реестре больше услуг на портале, чем в общих цифрах.",
      });
    if (data.metrics.portal == null)
      ctx.addIssue({
        code: "custom",
        message: "Укажите количество услуг на портале.",
      });
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
  portal: "На портале, не работает",
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
            portal:
              end.metrics.portal != null && baseline.metrics.portal != null
                ? end.metrics.portal - baseline.metrics.portal
                : null,
            working: end.metrics.working - baseline.metrics.working,
            individual:
              end.metrics.both != null && baseline.metrics.both != null
                ? end.metrics.individual -
                  end.metrics.both -
                  (baseline.metrics.individual - baseline.metrics.both)
                : null,
            business:
              end.metrics.both != null && baseline.metrics.both != null
                ? end.metrics.business -
                  end.metrics.both -
                  (baseline.metrics.business - baseline.metrics.both)
                : null,
            both:
              end.metrics.both != null && baseline.metrics.both != null
                ? end.metrics.both - baseline.metrics.both
                : null,
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

export function audienceBreakdown(metrics: Metrics) {
  return [
    {
      key: "individual",
      label: "Только физлица",
      value: metrics.both == null ? null : metrics.individual - metrics.both,
    },
    {
      key: "business",
      label: "Только юрлица",
      value: metrics.both == null ? null : metrics.business - metrics.both,
    },
    { key: "both", label: "Физлица и юрлица", value: metrics.both ?? null },
  ];
}

// Stored audience totals include shared services for compatibility with existing reports.
// All user-facing counts are disjoint: individual only, business only, and shared.
export function visibleMetrics(metrics: Metrics) {
  return {
    ...metrics,
    individual: metrics.both == null ? null : metrics.individual - metrics.both,
    business: metrics.both == null ? null : metrics.business - metrics.both,
  };
}
export function editVisibleMetric(
  metrics: Metrics,
  key: keyof Metrics,
  value: number | null,
): Metrics {
  if (key === "individual" || key === "business") {
    return {
      ...metrics,
      [key]: value == null ? NaN : value + (metrics.both ?? 0),
    };
  }
  if (key === "both" && value != null && metrics.both != null) {
    const change = value - metrics.both;
    return {
      ...metrics,
      both: value,
      individual: metrics.individual + change,
      business: metrics.business + change,
    };
  }
  return { ...metrics, [key]: value };
}

export function registryMetrics(
  base: Pick<Metrics, "declared" | "portal">,
  services: Service[],
): Metrics {
  const counts = services.reduce(
    (sum, service) => {
      const item = serviceContribution(service);
      return {
        working: sum.working + item.working,
        individual: sum.individual + item.individual,
        business: sum.business + item.business,
        both: sum.both + item.both,
      };
    },
    { working: 0, individual: 0, business: 0, both: 0 },
  );
  return { declared: base.declared, portal: base.portal, ...counts };
}
export function registryStore(store: Store): Store {
  return {
    ...store,
    snapshots: store.snapshots.map((snapshot) => ({
      ...snapshot,
      metrics: registryMetrics(snapshot.metrics, snapshot.services),
    })),
  };
}
// Accept only the two manual facts; recompute everything else on the server.
export const registrySaveSchema = z
  .object({
    revision: z.number().int().min(0),
    date: z.string(),
    note: z.string(),
    metrics: z.object({ declared: count, portal: count }),
    services: z.array(serviceSchema).max(10000),
  })
  .transform((input) => ({
    ...input,
    metrics: registryMetrics(input.metrics, input.services),
  }))
  .pipe(saveSchema);
