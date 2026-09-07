import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySave,
  asOf,
  compare,
  saveSchema,
  shiftDay,
  today,
  type Snapshot,
  type Store,
} from "../lib/model";
import { demoStore } from "../lib/demo";
const snapshot = (
  date: string,
  working: number,
  createdAt = `${date}T10:00:00Z`,
): Snapshot => ({
  id: createdAt,
  date,
  createdAt,
  note: "Обновление",
  metrics: { declared: 10, portal: 10, working, individual: 6, business: 4 },
  services: [],
});
const input = () => ({
  revision: 0,
  date: today(),
  note: "Первый отчёт",
  metrics: { declared: 10, portal: 10, working: 2, individual: 6, business: 4 },
  services: [],
});
test("Dushanbe calendar changes at 19:00 UTC", () => {
  assert.equal(today(new Date("2026-09-06T19:00:00Z")), "2026-09-07");
  assert.equal(today(new Date("2026-09-06T18:59:59Z")), "2026-09-06");
});
test("calendar arithmetic crosses months and leap day", () => {
  assert.equal(shiftDay("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
});
test("daily change uses last report before today and final revision today", () => {
  const data = [
    snapshot("2026-09-04", 2),
    snapshot("2026-09-07", 4),
    snapshot("2026-09-07", 6, "2026-09-07T12:00:00Z"),
  ];
  const result = compare(data, "2026-09-07", "2026-09-07");
  assert.equal(result.delta?.working, 4);
  assert.equal(result.baseline?.date, "2026-09-04");
});
test("missing baseline is unknown, not zero", () =>
  assert.equal(
    compare([snapshot("2026-09-07", 3)], "2026-09-07", "2026-09-07").delta,
    null,
  ));
test("period without changes carries forward latest known report", () =>
  assert.equal(
    compare([snapshot("2026-09-01", 3)], "2026-09-04", "2026-09-07").delta
      ?.working,
    0,
  ));
test("decreases remain negative", () =>
  assert.equal(
    compare(
      [snapshot("2026-09-01", 8), snapshot("2026-09-07", 4)],
      "2026-09-07",
      "2026-09-07",
    ).delta?.working,
    -4,
  ));
test("history never uses future snapshots", () =>
  assert.equal(asOf([snapshot("2026-09-07", 5)], "2026-09-06"), undefined));
test("save appends immutable historical report", () => {
  const old: Store = { revision: 0, services: [], snapshots: [] };
  const next = applySave(old, input(), "one", new Date().toISOString());
  assert.equal(old.snapshots.length, 0);
  assert.equal(next.snapshots.length, 1);
  assert.equal(next.revision, 1);
});
test("stale writes are rejected", () =>
  assert.throws(
    () =>
      applySave(
        { revision: 1, services: [], snapshots: [] },
        input(),
        "one",
        new Date().toISOString(),
      ),
    /CONFLICT/,
  ));
test("backdated entry cannot replace present-day registry", () => {
  const service = {
    id: "1",
    name: "Новая услуга",
    audience: "individual" as const,
    status: "working" as const,
  };
  const old: Store = {
    revision: 0,
    services: [service],
    snapshots: [{ ...snapshot(today(), 5), services: [service] }],
  };
  const next = applySave(
    old,
    { ...input(), date: shiftDay(today(), -1) },
    "backdate",
    new Date().toISOString(),
  );
  assert.deepEqual(next.services, [service]);
  assert.equal(next.snapshots.length, 2);
});
test("negative, fractional and impossible metrics rejected", () => {
  for (const metrics of [
    { declared: 10, portal: 10, working: 11, individual: 6, business: 4 },
    { declared: -1, portal: 0, working: 0, individual: 0, business: 0 },
    { declared: 10, portal: 10, working: 1.5, individual: 6, business: 4 },
    { declared: 10, portal: 10, working: 1, individual: 4, business: 4 },
  ])
    assert.equal(saveSchema.safeParse({ ...input(), metrics }).success, false);
});
test("overlapping audiences accepted", () =>
  assert.equal(
    saveSchema.safeParse({
      ...input(),
      metrics: {
        declared: 10,
        portal: 10,
        working: 2,
        individual: 8,
        business: 6,
      },
    }).success,
    true,
  ));
test("duplicate IDs rejected ignoring whitespace and case", () => {
  const service = {
    id: "S-001",
    name: "Услуга",
    audience: "individual",
    status: "planned",
  };
  assert.equal(
    saveSchema.safeParse({
      ...input(),
      services: [service, { ...service, id: " s-001 " }],
    }).success,
    false,
  );
});
test("future and invalid calendar dates rejected", () => {
  for (const date of [shiftDay(today(), 1), "2026-02-30", "wrong"])
    assert.equal(saveSchema.safeParse({ ...input(), date }).success, false);
});
test("registry may be partial but cannot exceed manual totals", () => {
  assert.equal(saveSchema.safeParse(input()).success, true);
  assert.equal(
    saveSchema.safeParse({
      ...input(),
      metrics: {
        declared: 0,
        portal: 0,
        working: 0,
        individual: 0,
        business: 0,
      },
      services: [
        { id: "1", name: "Услуга", audience: "individual", status: "planned" },
      ],
    }).success,
    false,
  );
});
test("all demo reports satisfy real validation", () => {
  for (const s of demoStore().snapshots)
    assert.equal(saveSchema.safeParse({ ...s, revision: 0 }).success, true);
});

test("cleared and inverted period inputs never crash the dashboard", () => {
  for (const [from, to] of [
    ["", "2026-09-07"],
    ["2026-09-07", ""],
    ["2026-09-08", "2026-09-07"],
  ])
    assert.equal(compare([], from, to).delta, null);
});
test("equal timestamps use last appended report", () => {
  const first = snapshot("2026-09-07", 1);
  const second = {
    ...first,
    id: "a",
    metrics: { ...first.metrics, working: 2 },
  };
  assert.equal(
    asOf([{ ...first, id: "z" }, second], "2026-09-07")?.metrics.working,
    2,
  );
});
test("nonworking registry cannot contradict reported working total", () =>
  assert.equal(
    saveSchema.safeParse({
      ...input(),
      metrics: {
        declared: 1,
        portal: 1,
        working: 1,
        individual: 1,
        business: 0,
      },
      services: [
        {
          id: "1",
          name: "Не запущено",
          status: "planned",
          audience: "individual",
        },
      ],
    }).success,
    false,
  ));

test("portal totals must sit between working and declared and be provided", () => {
  const base = input();
  for (const portal of [null, undefined, -1, 1, 11, 2.5]) {
    assert.equal(
      saveSchema.safeParse({ ...base, metrics: { ...base.metrics, portal } })
        .success,
      false,
    );
  }
  assert.equal(
    saveSchema.safeParse({ ...base, metrics: { ...base.metrics, portal: 7 } })
      .success,
    true,
  );
});
test("portal history preserves unknown baseline and calculates known changes", () => {
  const a = snapshot("2026-09-01", 2);
  const b = snapshot("2026-09-02", 3);
  a.metrics.portal = null;
  b.metrics.portal = 8;
  assert.equal(compare([a, b], b.date, b.date).delta?.portal, null);
  a.metrics.portal = 6;
  assert.equal(compare([a, b], b.date, b.date).delta?.portal, 2);
  assert.equal(a.metrics.portal, 6);
});
