import { test } from "node:test";
import assert from "node:assert/strict";
import { servicesByFreshness, type Service, type Snapshot } from "../lib/model";
const a: Service = {
  id: "a",
  name: "First service",
  audience: "individual",
  status: "working",
};
const b: Service = { ...a, id: "b", name: "Second service" };
const c: Service = { ...a, id: "c", name: "New service" };
const report = (id: string, services: Service[]): Snapshot => ({
  id,
  date: "2026-09-08",
  createdAt: `2026-09-08T0${id}:00:00Z`,
  note: "Report",
  metrics: {
    declared: 116,
    portal: services.length,
    working: services.length,
    individual: services.length,
    business: 0,
    both: 0,
  },
  services,
});
const ids = (services: Service[]) => services.map((s) => s.id);
test("new additions and property edits come first without reordering stored records", () => {
  const paid = { ...a, payment: "paid" as const };
  const history = [
    report("1", [a, b]),
    report("2", [a, b, c]),
    report("3", [paid, b, c]),
  ];
  const original = JSON.stringify(history);
  assert.deepEqual(ids(servicesByFreshness(history[2].services, history)), [
    "a",
    "c",
    "b",
  ]);
  assert.deepEqual(
    ids(servicesByFreshness(history[1].services, history, "2")),
    ["c", "a", "b"],
  );
  assert.equal(JSON.stringify(history), original);
});
test("metric-only reports and row rearrangement do not count as edits", () => {
  const history = [
    report("1", [a, b]),
    report("2", [a, b, c]),
    report("3", [b, a, c]),
  ];
  assert.deepEqual(ids(servicesByFreshness(history[2].services, history)), [
    "c",
    "b",
    "a",
  ]);
});
test("all editable properties affect freshness and missing history keeps a stable order", () => {
  for (const patch of [
    { name: "Renamed" },
    { category: "Документы" as const },
    { audience: "both" as const },
    { status: "notWorking" as const },
    { payment: "free" as const },
  ]) {
    const edited = { ...a, ...patch };
    const history = [
      report("1", [a, b]),
      report("2", [a, b, c]),
      report("3", [edited, b, c]),
    ];
    assert.equal(servicesByFreshness(history[2].services, history)[0].id, "a");
  }
  assert.deepEqual(ids(servicesByFreshness([b, a], [])), ["b", "a"]);
});
test("re-added services are fresh and equal report times follow appended order", () => {
  const history = [
    report("1", [a, b]),
    report("2", [b, c]),
    { ...report("3", [a, b, c]), createdAt: report("2", []).createdAt },
  ];
  assert.deepEqual(ids(servicesByFreshness(history[2].services, history)), [
    "a",
    "c",
    "b",
  ]);
});
