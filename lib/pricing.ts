import { z } from "zod";
import type { Service } from "./model";

// User-provided calculation basis, saved with each tariff rather than applied retroactively.
export const DEFAULT_INDICATOR_RATE = 78;
const amount = z
  .number()
  .positive("Цена должна быть больше нуля.")
  .max(1_000_000, "Максимальное значение — 1 000 000.")
  .multipleOf(0.01, "Не более двух знаков после запятой.");
const basis = { unit: z.enum(["somoni", "indicator"]), indicatorRate: amount };
export const pricingSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), amount, ...basis }),
    z
      .object({ kind: z.literal("range"), min: amount, max: amount, ...basis })
      .refine((p) => p.max >= p.min, {
        message: "Максимальная цена не может быть меньше минимальной.",
        path: ["max"],
      }),
  ])
  .refine(
    (p) =>
      (p.kind === "fixed" ? p.amount : p.max) *
        (p.unit === "indicator" ? p.indicatorRate : 1) <=
      1_000_000_000,
    { message: "Стоимость услуги не должна превышать 1 млрд сомони." },
  );
export type Pricing = z.infer<typeof pricingSchema>;
export const audiencePricingSchema = z.object({
  individual: pricingSchema.nullable(),
  business: pricingSchema.nullable(),
});
export type PriceAudience = "any" | "individual" | "business";
type PriceService = Pick<Service, "payment" | "pricing"> &
  Partial<Pick<Service, "audience" | "audiencePricing">>;
export function supportsPriceAudience(
  service: Pick<Service, "audience">,
  audience: PriceAudience,
) {
  return (
    audience === "any" ||
    service.audience === "both" ||
    service.audience === audience
  );
}
export function tariffFor(
  service: PriceService,
  audience: "individual" | "business",
) {
  return service.audiencePricing
    ? service.audiencePricing[audience]
    : service.pricing;
}
export const money = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value) + " с.";
export const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export function priceBounds(
  service: PriceService,
  audience: PriceAudience = "any",
): { min: number; max: number } | null {
  if (
    service.audience &&
    !supportsPriceAudience({ audience: service.audience }, audience)
  )
    return null;
  if (service.payment === "free") return { min: 0, max: 0 };
  if (service.payment !== "paid") return null;
  if (service.audiencePricing) {
    if (service.audience === "unknown") return null;
    const targets =
      audience !== "any"
        ? [audience]
        : service.audience && service.audience !== "both"
          ? [service.audience]
          : (["individual", "business"] as const);
    const bounds = targets.map((a) =>
      priceBounds({
        payment: "paid",
        pricing: tariffFor(service, a as "individual" | "business"),
      }),
    );
    // A missing audience tariff cannot be treated as zero or replaced by the other audience's price.
    if (bounds.some((b) => !b)) return null;
    return {
      min: Math.min(...bounds.map((b) => b!.min)),
      max: Math.max(...bounds.map((b) => b!.max)),
    };
  }
  const parsed = pricingSchema.safeParse(service.pricing);
  if (!parsed.success) return null;
  const p = parsed.data;
  const rate = p.unit === "indicator" ? p.indicatorRate : 1;
  return {
    min: roundMoney((p.kind === "fixed" ? p.amount : p.min) * rate),
    max: roundMoney((p.kind === "fixed" ? p.amount : p.max) * rate),
  };
}
export function priceBasis(pricing: Pricing) {
  const number = (v: number) =>
    v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const value =
    pricing.kind === "fixed"
      ? number(pricing.amount)
      : `${number(pricing.min)}–${number(pricing.max)}`;
  return pricing.unit === "indicator"
    ? `${value} показ. × ${money(pricing.indicatorRate)}`
    : pricing.kind === "fixed"
      ? "Фиксированная цена"
      : "Диапазон цены";
}
export function pricingSummary(
  services: Service[],
  audience: PriceAudience = "any",
) {
  let minCents = 0,
    maxCents = 0,
    priced = 0,
    missing = 0,
    free = 0,
    unknown = 0;
  for (const service of services) {
    if (!supportsPriceAudience(service, audience)) continue;
    if (service.payment === "free") {
      free++;
      continue;
    }
    if (service.payment !== "paid") {
      unknown++;
      continue;
    }
    const bounds = priceBounds(service, audience);
    if (!bounds) {
      missing++;
      continue;
    }
    priced++;
    minCents += Math.round(bounds.min * 100);
    maxCents += Math.round(bounds.max * 100);
  }
  return {
    min: priced ? minCents / 100 : null,
    max: priced ? maxCents / 100 : null,
    priced,
    missing,
    free,
    unknown,
    paid: priced + missing,
  };
}
export function paidFirst(services: Service[]) {
  const rank = (s: Service) =>
    s.payment === "paid" ? 0 : s.payment === "free" ? 1 : 2;
  return [...services].sort((a, b) => rank(a) - rank(b));
}
export function revenueScenario(
  services: Service[],
  quantity: number,
  commission: number,
  audience: PriceAudience = "any",
) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > 1_000_000 ||
    !Number.isFinite(commission) ||
    commission < 0 ||
    commission > 100
  )
    return null;
  const totals = pricingSummary(services, audience);
  if (
    totals.max !== null &&
    totals.max * quantity * commission > Number.MAX_SAFE_INTEGER
  )
    return null;
  return {
    min:
      totals.min === null
        ? null
        : roundMoney((totals.min * quantity * commission) / 100),
    max:
      totals.max === null
        ? null
        : roundMoney((totals.max * quantity * commission) / 100),
  };
}
