import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceBounds,
  pricingSummary,
  revenueScenario,
  type Pricing,
} from "../lib/pricing";
import {
  applySave,
  registrySaveSchema,
  serviceSchema,
  servicesByFreshness,
  today,
  type Service,
  type Store,
} from "../lib/model";
const tariff = (amount: number): Pricing => ({
  kind: "fixed",
  unit: "somoni",
  amount,
  indicatorRate: 78,
});
const shared: Service = {
  id: "shared",
  name: "Shared service",
  audience: "both",
  payment: "paid",
  status: "working",
  pricing: tariff(90),
  audiencePricing: { individual: tariff(100), business: tariff(250) },
};

test("shared service has independent tariffs and contributes once to overall bounds", () => {
  assert.deepEqual(priceBounds(shared), { min: 100, max: 250 });
  assert.deepEqual(priceBounds(shared, "individual"), { min: 100, max: 100 });
  assert.deepEqual(priceBounds(shared, "business"), { min: 250, max: 250 });
  assert.equal(pricingSummary([shared]).priced, 1);
  assert.deepEqual(revenueScenario([shared], 10, 10, "individual"), {
    min: 100,
    max: 100,
  });
  assert.deepEqual(revenueScenario([shared], 10, 10, "business"), {
    min: 250,
    max: 250,
  });
});
test("audience selection includes shared and matching exclusive services only", () => {
  const physical: Service = {
    ...shared,
    id: "physical",
    audience: "individual",
    audiencePricing: null,
    pricing: tariff(20),
  };
  const legal: Service = {
    ...shared,
    id: "legal",
    audience: "business",
    audiencePricing: null,
    pricing: tariff(30),
  };
  const list = [shared, physical, legal];
  assert.equal(priceBounds(physical, "business"), null);
  assert.equal(pricingSummary(list, "individual").min, 120);
  assert.equal(pricingSummary(list, "business").max, 280);
  assert.deepEqual(
    [
      pricingSummary(list).min,
      pricingSummary(list).max,
      pricingSummary(list).priced,
    ],
    [150, 300, 3],
  );
});
test("an unfilled audience never inherits the other or old common tariff", () => {
  const partial = {
    ...shared,
    audiencePricing: { individual: tariff(100), business: null },
  };
  assert.equal(priceBounds(partial), null);
  assert.equal(priceBounds(partial, "business"), null);
  assert.equal(priceBounds(partial, "individual")!.min, 100);
  assert.equal(pricingSummary([partial]).missing, 1);
  assert.equal(pricingSummary([partial], "individual").priced, 1);
  assert.equal(pricingSummary([partial], "business").missing, 1);
});
test("ranges and indicators are independent for each audience; narrowing audience retains its tariff", () => {
  const value: Service = {
    ...shared,
    audiencePricing: {
      individual: {
        kind: "range",
        unit: "indicator",
        min: 0.5,
        max: 2,
        indicatorRate: 78,
      },
      business: tariff(250),
    },
  };
  assert.deepEqual(priceBounds(value), { min: 39, max: 250 });
  assert.deepEqual(priceBounds(value, "individual"), { min: 39, max: 156 });
  assert.deepEqual(priceBounds({ ...value, audience: "business" }), {
    min: 250,
    max: 250,
  });
  assert.deepEqual(priceBounds({ ...value, payment: "free" }), {
    min: 0,
    max: 0,
  });
  assert.equal(
    serviceSchema.safeParse({
      ...value,
      audiencePricing: { individual: tariff(-1), business: null },
    }).success,
    false,
  );
});
test("old common tariffs remain unchanged and explicit common mode restores them", () => {
  assert.deepEqual(priceBounds({ ...shared, audiencePricing: undefined }), {
    min: 90,
    max: 90,
  });
  assert.deepEqual(
    priceBounds({ ...shared, audiencePricing: null }, "business"),
    { min: 90, max: 90 },
  );
});
test("split prices persist with immutable history and survive saves from older tabs", () => {
  let store: Store = { revision: 0, services: [], snapshots: [] };
  const save = (s: Service, index: number) => {
    const input = registrySaveSchema.parse({
      revision: store.revision,
      date: today(),
      note: "Audience price update",
      metrics: { declared: 116 },
      services: [s],
    });
    store = applySave(
      store,
      input,
      String(index),
      `${today()}T12:00:0${index}Z`,
    );
  };
  save({ ...shared, audiencePricing: undefined }, 1);
  const original = structuredClone(store.snapshots[0]);
  save(shared, 2);
  assert.deepEqual(store.services[0].audiencePricing, shared.audiencePricing);
  assert.deepEqual(store.snapshots[0], original);
  save(
    {
      ...shared,
      name: "Older client edit",
      pricing: undefined,
      audiencePricing: undefined,
    },
    3,
  );
  assert.deepEqual(store.services[0].audiencePricing, shared.audiencePricing);
  assert.deepEqual(store.services[0].pricing, tariff(90));
  assert.deepEqual(store.snapshots[2].metrics, original.metrics);
  save({ ...shared, audiencePricing: null }, 4);
  assert.equal(store.services[0].audiencePricing, null);
  assert.equal(priceBounds(store.services[0])!.min, 90);
  assert.deepEqual(
    store.snapshots[1].services[0].audiencePricing,
    shared.audiencePricing,
  );
});
test("changing either audience tariff moves service to the top of freshness order", () => {
  const other = { ...shared, id: "other", audiencePricing: null };
  const base = {
    date: today(),
    note: "Test",
    metrics: {
      declared: 116,
      portal: 2,
      working: 2,
      individual: 2,
      business: 2,
      both: 2,
    },
  };
  const history = [
    {
      ...base,
      id: "1",
      createdAt: `${today()}T12:00:00Z`,
      services: [other, shared],
    },
    {
      ...base,
      id: "2",
      createdAt: `${today()}T12:01:00Z`,
      services: [
        other,
        {
          ...shared,
          audiencePricing: { individual: tariff(101), business: tariff(250) },
        },
      ],
    },
  ];
  assert.equal(
    servicesByFreshness(history[1].services, history)[0].id,
    "shared",
  );
});
