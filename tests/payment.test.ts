import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serviceSchema,
  registrySaveSchema,
  applySave,
  currentRegistryMetrics as registryMetrics,
  today,
} from "../lib/model";
import { demoStore } from "../lib/demo";

test("payment remains unspecified on old services and rejects unsupported values", () => {
  const service = demoStore().services[0];
  assert.equal(serviceSchema.parse(service).payment, undefined);
  for (const payment of ["paid", "free"] as const)
    assert.equal(serviceSchema.parse({ ...service, payment }).payment, payment);
  assert.equal(
    serviceSchema.safeParse({ ...service, payment: "other" }).success,
    false,
  );
});

test("editing payment preserves IDs, other services, manual facts, counts and previous reports", () => {
  let store = demoStore();
  const original = structuredClone(store);
  const latest = store.snapshots.at(-1)!;
  for (const payment of ["paid", "free", undefined] as const) {
    const services = store.services.map((s, index) =>
      index === 0 ? { ...s, payment } : s,
    );
    const input = registrySaveSchema.parse({
      revision: store.revision,
      date: today(),
      note: "Изменена оплата услуги",
      metrics: latest.metrics,
      services,
    });
    store = applySave(
      store,
      input,
      `payment-${payment}`,
      new Date().toISOString(),
    );
    assert.equal(store.services[0].payment, payment);
    assert.equal(store.services[0].id, original.services[0].id);
    assert.deepEqual(store.services.slice(1), original.services.slice(1));
    assert.deepEqual(
      store.snapshots.at(-1)!.metrics,
      registryMetrics(latest.metrics, original.services),
    );
    assert.deepEqual(
      store.snapshots.slice(0, original.snapshots.length),
      original.snapshots,
    );
  }
});
