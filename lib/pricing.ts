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
  service: Pick<Service, "payment" | "pricing">,
): { min: number; max: number } | null {
  if (service.payment === "free") return { min: 0, max: 0 };
  if (service.payment !== "paid") return null;
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
export function pricingSummary(services: Service[]) {
  let minCents = 0,
    maxCents = 0,
    priced = 0,
    missing = 0,
    free = 0,
    unknown = 0;
  for (const service of services) {
    if (service.payment === "free") {
      free++;
      continue;
    }
    if (service.payment !== "paid") {
      unknown++;
      continue;
    }
    const bounds = priceBounds(service);
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
  const totals = pricingSummary(services);
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
