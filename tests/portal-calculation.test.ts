import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentRegistryMetrics,
  paymentBreakdown,
  registrySaveSchema,
  applySave,
  registryStore,
  analysisSnapshots,
  matchesRegistryFilters,
  today,
  type Service,
  type Store,
} from "../lib/model";
const rows: Service[] = Array.from({ length: 54 }, (_, i) => ({
  id: `service-${i}`,
  name: `Услуга ${i}`,
  audience: i % 2 ? "both" : "individual",
  status: i < 35 ? "working" : i < 47 ? "notWorking" : "planned",
  ...(i < 10
    ? { payment: "paid" as const }
    : i < 30
      ? { payment: "free" as const }
      : {}),
}));

test("35 working + 12 not working = 47 on portal; each shared service counts once", () => {
  const before = JSON.stringify(rows);
  const metrics = currentRegistryMetrics({ declared: 116, portal: 49 }, rows);
  assert.equal(metrics.portal, 47);
  assert.equal(metrics.working, 35);
  assert.equal(metrics.notWorking, 12);
  assert.equal(metrics.declared, 116);
  assert.equal(Math.round((metrics.working / metrics.portal!) * 100), 74);
  assert.deepEqual(paymentBreakdown(rows), { paid: 10, free: 20, unknown: 24 });
  assert.equal(JSON.stringify(rows), before);
  assert.equal(
    rows.filter((s) => matchesRegistryFilters(s, "onPortal", "all")).length,
    metrics.portal,
  );
});

test("legacy nonworking portal status remains unchanged and is counted consistently", () => {
  const services: Service[] = [
    { id: "legacy", name: "Старая услуга", status: "portal", audience: "both" },
  ];
  assert.equal(
    currentRegistryMetrics({ declared: 116, portal: null }, services)
      .notWorking,
    1,
  );
  assert.equal(
    currentRegistryMetrics({ declared: 116, portal: null }, services).portal,
    1,
  );
  assert.equal(matchesRegistryFilters(services[0], "notWorking", "all"), true);
  assert.equal(services[0].status, "portal");
});

test("recalculation and saving a new report preserve prior facts, service IDs, properties and history", () => {
  const oldMetrics = {
    ...currentRegistryMetrics({ declared: 116, portal: 49 }, rows),
    portal: 49,
  };
  const store: Store = {
    revision: 1,
    services: rows,
    snapshots: [
      {
        id: "old",
        date: today(),
        createdAt: "2026-09-07T01:00:00Z",
        note: "Сохранённые ручные данные",
        metrics: oldMetrics,
        services: rows,
      },
    ],
  };
  const original = JSON.stringify(store);
  assert.equal(analysisSnapshots(store.snapshots)[0].metrics.portal, 47);
  assert.equal(registryStore(store).snapshots[0].metrics.portal, 49);
  assert.equal(JSON.stringify(store), original);
  const parsed = registrySaveSchema.parse({
    revision: 1,
    date: today(),
    note: "Новый расчёт",
    metrics: { declared: 116 },
    services: rows,
  });
  const next = applySave(store, parsed, "new", "2026-09-07T02:00:00Z");
  assert.deepEqual(next.snapshots[0], store.snapshots[0]);
  assert.equal(next.snapshots[0].metrics.portal, 49);
  assert.equal(next.snapshots[1].metrics.portal, 47);
  assert.deepEqual(next.services, rows);
  assert.equal(JSON.stringify(store), original);
  assert.equal(
    currentRegistryMetrics({ declared: 116, portal: 49 }, []).portal,
    0,
  );
  assert.deepEqual(paymentBreakdown([]), { paid: 0, free: 0, unknown: 0 });
});
