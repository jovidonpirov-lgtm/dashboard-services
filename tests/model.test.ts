import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySave,
  adjustServiceTotals,
  audienceBreakdown,
  type Service,
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
  metrics: {
    declared: 10,
    portal: 10,
    working,
    individual: 6,
    business: 4,
    both: null,
  },
  services: [],
});
const input = () => ({
  revision: 0,
  date: today(),
  note: "Первый отчёт",
  metrics: {
    declared: 10,
    portal: 10,
    working: 2,
    individual: 6,
    business: 4,
    both: null,
  },
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
    {
      declared: 10,
      portal: 10,
      working: 11,
      individual: 6,
      business: 4,
      both: null,
    },
    {
      declared: -1,
      portal: 0,
      working: 0,
      individual: 0,
      business: 0,
      both: null,
    },
    {
      declared: 10,
      portal: 10,
      working: 1.5,
      individual: 6,
      business: 4,
      both: null,
    },
    {
      declared: 10,
      portal: 10,
      working: 1,
      individual: 11,
      business: 4,
      both: null,
    },
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
        both: null,
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
        both: null,
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
        both: null,
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

test("individual services accumulate on manual totals without recounting existing registry", () => {
  const start = {
    declared: 10,
    portal: 8,
    working: 6,
    individual: 5,
    business: 5,
    both: null,
  };
  const service: Service = {
    id: "new",
    name: "Новая услуга",
    audience: "individual",
    status: "working",
  };
  const added = adjustServiceTotals(start, undefined, service);
  assert.deepEqual(added, {
    declared: 11,
    portal: 9,
    working: 7,
    individual: 6,
    business: 5,
    both: null,
  });
  assert.deepEqual(
    adjustServiceTotals(added, service, { ...service, name: "Другое имя" }),
    added,
  );
  assert.deepEqual(adjustServiceTotals(added, service, undefined), start);
  const changed = adjustServiceTotals(added, service, {
    ...service,
    audience: "both",
    status: "portal",
  });
  assert.deepEqual(changed, {
    declared: 11,
    portal: 9,
    working: 6,
    individual: 6,
    business: 6,
    both: null,
  });
  assert.deepEqual(
    adjustServiceTotals({ ...added, declared: 100 }, service, {
      ...service,
      status: "planned",
    }),
    {
      declared: 100,
      portal: 8,
      working: 6,
      individual: 6,
      business: 5,
      both: null,
    },
  );
});
test("adding services leaves missing historical portal counts unknown", () => {
  const service: Service = {
    id: "one",
    name: "Услуга",
    audience: "business",
    status: "portal",
  };
  const added = adjustServiceTotals(
    {
      declared: 10,
      portal: null,
      working: 2,
      individual: 5,
      business: 5,
      both: null,
    },
    undefined,
    service,
  );
  assert.equal(added.portal, null);
  assert.equal(added.business, 6);
  assert.equal(added.declared, 11);
});

test("partial audience figures from the report can be saved", () => {
  assert.equal(
    saveSchema.safeParse({
      ...input(),
      metrics: {
        declared: 116,
        portal: 59,
        working: 36,
        individual: 10,
        business: 26,
        both: null,
      },
    }).success,
    true,
  );
});
test("both audiences count once in service totals and once in each audience", () => {
  const service: Service = {
    id: "both",
    name: "Общая услуга",
    audience: "both",
    status: "working",
  };
  const metrics = adjustServiceTotals(
    {
      declared: 0,
      portal: 0,
      working: 0,
      individual: 0,
      business: 0,
      both: null,
    },
    undefined,
    service,
  );
  assert.deepEqual(metrics, {
    declared: 1,
    portal: 1,
    working: 1,
    individual: 1,
    business: 1,
    both: null,
  });
  assert.equal(
    saveSchema.safeParse({ ...input(), metrics, services: [service] }).success,
    true,
  );
});

test("audience groups partition overlapping totals without double counting", () => {
  const metrics = {
    declared: 36,
    portal: 36,
    working: 36,
    individual: 16,
    business: 26,
    both: 6,
  };
  assert.deepEqual(
    audienceBreakdown(metrics).map((g) => g.value),
    [10, 20, 6],
  );
  assert.equal(saveSchema.safeParse({ ...input(), metrics }).success, true);
  for (const both of [-1, 17, 5, 1.5]) {
    assert.equal(
      saveSchema.safeParse({ ...input(), metrics: { ...metrics, both } })
        .success,
      false,
    );
  }
  assert.deepEqual(
    audienceBreakdown({ ...metrics, both: null }).map((g) => g.value),
    [null, null, null],
  );
  const service: Service = {
    id: "both",
    name: "Общая услуга",
    audience: "both",
    status: "working",
  };
  const next = adjustServiceTotals(metrics, undefined, service);
  assert.equal(next.both, 7);
  assert.deepEqual(
    audienceBreakdown(next).map((g) => g.value),
    [10, 20, 7],
  );
  assert.deepEqual(adjustServiceTotals(next, service, undefined), metrics);
  const a = snapshot("2026-09-01", 2),
    b = snapshot("2026-09-02", 3);
  a.metrics.both = 1;
  b.metrics.both = 3;
  assert.equal(compare([a, b], b.date, b.date).delta?.both, 2);
  a.metrics.both = null;
  assert.equal(compare([a, b], b.date, b.date).delta?.both, null);
});

test("service IDs are generated for blank or omitted input and supplied IDs are preserved", () => {
  const row = {
    name: "Электронная подпись",
    audience: "individual",
    status: "planned",
  };
  const result = saveSchema.parse({
    ...input(),
    services: [{ ...row }, { ...row, id: "  " }, { ...row, id: " custom-id " }],
  });
  assert.equal(new Set(result.services.map((s) => s.id)).size, 3);
  assert.ok(result.services[0].id.length > 0);
  assert.ok(result.services[1].id.length > 0);
  assert.equal(result.services[2].id, "custom-id");
  assert.deepEqual(saveSchema.parse(result).services, result.services);
});
