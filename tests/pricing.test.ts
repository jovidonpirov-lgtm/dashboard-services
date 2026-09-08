import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pricingSchema,
  priceBounds,
  pricingSummary,
  paidFirst,
  revenueScenario,
  type Pricing,
} from "../lib/pricing";
import {
  serviceSchema,
  registrySaveSchema,
  applySave,
  servicesByFreshness,
  today,
  type Service,
  type Store,
} from "../lib/model";
const fixed: Pricing = {
  kind: "fixed",
  unit: "somoni",
  amount: 100.25,
  indicatorRate: 78,
};
const range: Pricing = {
  kind: "range",
  unit: "indicator",
  min: 0.5,
  max: 2,
  indicatorRate: 78,
};
const service = (id: string, patch: Partial<Service> = {}): Service => ({
  id,
  name: `Service ${id}`,
  audience: "both",
  status: "working",
  payment: "paid",
  ...patch,
});

test("tariffs support fixed, ranges and fractional indicators with per-service saved rates", () => {
  assert.deepEqual(priceBounds(service("a", { pricing: fixed })), {
    min: 100.25,
    max: 100.25,
  });
  assert.deepEqual(priceBounds(service("a", { pricing: range })), {
    min: 39,
    max: 156,
  });
  assert.deepEqual(
    priceBounds(service("a", { pricing: { ...range, indicatorRate: 80 } })),
    { min: 40, max: 160 },
  );
  assert.deepEqual(
    priceBounds(
      service("a", { pricing: { ...fixed, unit: "indicator", amount: 1.25 } }),
    ),
    { min: 97.5, max: 97.5 },
  );
});
test("unknown price is not zero; free services ignore inactive tariffs", () => {
  assert.equal(priceBounds(service("a")), null);
  assert.equal(priceBounds(service("a", { pricing: null })), null);
  assert.equal(
    priceBounds(service("a", { payment: undefined, pricing: fixed })),
    null,
  );
  assert.deepEqual(
    priceBounds(service("a", { payment: "free", pricing: fixed })),
    { min: 0, max: 0 },
  );
  assert.equal(pricingSummary([service("a")]).min, null);
});
test("invalid prices reject negative, empty, non-finite, inverted and excessive precision values", () => {
  for (const amount of [0, -1, NaN, Infinity, 1_000_001, 1.001, "10", null])
    assert.equal(pricingSchema.safeParse({ ...fixed, amount }).success, false);
  assert.equal(
    pricingSchema.safeParse({ ...range, min: 3, max: 2 }).success,
    false,
  );
  assert.equal(
    pricingSchema.safeParse({ ...range, indicatorRate: 0 }).success,
    false,
  );
  assert.equal(
    pricingSchema.safeParse({ ...fixed, amount: 0.29 }).success,
    true,
  );
  assert.equal(
    serviceSchema.safeParse(service("a", { pricing: { ...fixed, amount: -1 } }))
      .success,
    false,
  );
});
test("totals sum each shared-audience service once, exclude missing prices and sum cents exactly", () => {
  const services = [
    service("a", { pricing: fixed }),
    service("b", { pricing: range }),
    service("c"),
    service("d", { payment: "free" }),
    service("e", { payment: undefined }),
  ];
  assert.deepEqual(pricingSummary(services), {
    min: 139.25,
    max: 256.25,
    priced: 2,
    missing: 1,
    free: 1,
    unknown: 1,
    paid: 3,
  });
  assert.equal(
    pricingSummary([
      service("a", { pricing: { ...fixed, amount: 0.1 } }),
      service("b", { pricing: { ...fixed, amount: 0.2 } }),
    ]).min,
    0.3,
  );
  assert.deepEqual(revenueScenario(services, 10, 10), {
    min: 139.25,
    max: 256.25,
  });
  assert.deepEqual(revenueScenario(services, 0, 100), { min: 0, max: 0 });
  assert.equal(revenueScenario(services, 0.5, 10), null);
  assert.equal(revenueScenario(services, 1, 101), null);
  assert.equal(revenueScenario(services, NaN, 10), null);
});
test("paid-first preserves freshness within each group without mutating the registry", () => {
  const list = [
    service("f", { payment: "free" }),
    service("new"),
    service("u", { payment: undefined }),
    service("old"),
  ];
  assert.deepEqual(
    paidFirst(list).map((s) => s.id),
    ["new", "old", "f", "u"],
  );
  assert.equal(list[0].id, "f");
});
test("price edits persist in snapshots; old clients cannot erase prices; explicit clear works", () => {
  const services = [service("a"), service("b")];
  let store: Store = { revision: 0, services: [], snapshots: [] };
  const save = (services: Service[], index: number) => {
    const input = registrySaveSchema.parse({
      revision: store.revision,
      date: today(),
      note: "Test price edit",
      metrics: { declared: 116 },
      services,
    });
    store = applySave(
      store,
      input,
      String(index),
      `${today()}T12:00:0${index}Z`,
    );
  };
  save(services, 1);
  const original = structuredClone(store.snapshots[0]);
  save([service("a", { pricing: fixed }), services[1]], 2);
  assert.deepEqual(store.services[0].pricing, fixed);
  assert.deepEqual(store.snapshots[0], original);
  const metrics = structuredClone(store.snapshots[1].metrics);
  save([service("a", { name: "Older client renamed" }), services[1]], 3);
  assert.deepEqual(store.services[0].pricing, fixed);
  assert.deepEqual(store.snapshots[2].metrics, metrics);
  save([store.services[0], service("b", { pricing: range })], 4);
  assert.equal(servicesByFreshness(store.services, store.snapshots)[0].id, "b");
  save([service("a", { pricing: null }), service("b", { pricing: range })], 5);
  assert.equal(store.services[0].pricing, null);
  assert.deepEqual(store.snapshots[1].services[0].pricing, fixed);
  const current = structuredClone(store.services);
  const old = registrySaveSchema.parse({
    revision: store.revision,
    date: "2026-01-01",
    note: "Backdated report",
    metrics: { declared: 116 },
    services,
  });
  store = applySave(store, old, "old", `${today()}T13:00:00Z`);
  assert.deepEqual(store.services, current);
  assert.equal(store.snapshots.at(-1)!.services[1].pricing, undefined);
});
