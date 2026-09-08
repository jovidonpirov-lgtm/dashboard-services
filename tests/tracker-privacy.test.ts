import { test } from "node:test";
import assert from "node:assert/strict";
import { importWorkTracker } from "../lib/tracker-import";
import { publicStore } from "../lib/public-data";
import {
  applySave,
  currentRegistryMetrics,
  metricFilters,
  registrySaveSchema,
  today,
  type Service,
  type Store,
} from "../lib/model";

const headers = [
  "№",
  "ID реестра",
  "Точность ID",
  "Услуга (как в работе)",
  "Услуга по реестру",
  "Ведомство",
  "Состояние",
  "Дедлайн",
  "Дней до срока",
  "Кто держит",
  "Что нужно сделать",
  "Ответственный",
  "Оплата",
  "Статус: Список",
  "Статус: Доработки",
  "Статус: Док по порталу",
  "Конфликт",
  "Источники",
  "Новый срок",
  "Комментарий",
  null,
];
const row = (name: string, state = "В работе") => [
  1,
  "000047",
  null,
  name,
  null,
  "Ведомство",
  state,
  "2026-08-25",
  0,
  "Обе стороны",
  "Подключить ЭЦП",
  "Ответственный",
  "В доработке",
  "Реализован",
  "Доработка",
  "На стадии запуска",
  "ДА",
  "ABC",
  "После теста",
  "Комментарий",
  "Дополнительный комментарий",
];
const existing: Service = {
  id: "existing",
  name: "Услуга первая",
  status: "working",
  audience: "both",
  payment: "paid",
  pricing: { kind: "fixed", amount: 156, unit: "somoni", indicatorRate: 78 },
  audiencePricing: {
    individual: {
      kind: "fixed",
      amount: 2,
      unit: "indicator",
      indicatorRate: 78,
    },
    business: null,
  },
};

test("work import preserves existing statuses, prices and fields; repeated registry IDs do not merge subservices", () => {
  const before = JSON.stringify(existing);
  const sheet = [
    headers,
    row(existing.name),
    row("Другая подуслуга"),
    row("Запущенная", "Запущена"),
  ];
  const result = importWorkTracker([existing], sheet, "tracker.xlsx");
  assert.equal(result.added, 1);
  assert.equal(result.enriched, 1);
  assert.equal(result.sourceRows, 2);
  assert.equal(JSON.stringify(existing), before);
  const { work, ...retained } = result.services[0];
  assert.deepEqual(retained, existing);
  assert.equal(work?.todo, "Подключить ЭЦП");
  assert.equal(work?.comment, "Комментарий\n\nДополнительный комментарий");
  assert.equal(
    work?.sources?.[0].cells["Без заголовка (21)"],
    "Дополнительный комментарий",
  );
  assert.equal(result.services[1].status, "progress");
  assert.equal(result.services[1].audience, "unknown");
  assert.equal(result.services[1].payment, undefined);
  const again = importWorkTracker(result.services, sheet, "tracker.xlsx");
  assert.equal(again.changed, 0);
  assert.deepEqual(again.services, result.services);
});
test("known alias merges while keeping both original rows and exact comments", () => {
  const name =
    "Государственная регистрация расторжения брака супругов, не имеющих общих несовершеннолетних детей";
  const r = importWorkTracker(
    [],
    [
      headers,
      row(name),
      row(
        "Расторжение брака супругов, не имеющих общих несовершеннолетних детей",
        "В работе (нет в док. по порталу)",
      ),
    ],
    "tracker.xlsx",
  );
  assert.equal(r.added, 1);
  assert.equal(r.sourceRows, 2);
  assert.equal(r.services[0].work?.sources?.length, 2);
});
test("public projection removes all tariff fields and source cells from current and historical services, without modifying storage", () => {
  const service = {
    ...existing,
    work: {
      todo: "Доработать",
      sources: [{ file: "x", sheet: "y", row: 2, cells: { Оплата: "156" } }],
    },
  };
  const store: Store = {
    revision: 1,
    services: [service],
    snapshots: [
      {
        id: "s",
        createdAt: new Date().toISOString(),
        date: today(),
        note: "Отчёт",
        metrics: currentRegistryMetrics({ declared: 116, portal: 1 }, [
          service,
        ]),
        services: [service],
      },
    ],
  };
  const before = JSON.stringify(store),
    safe = publicStore(store);
  assert.equal(JSON.stringify(store), before);
  for (const s of [
    ...safe.services,
    ...safe.snapshots.flatMap((s) => s.services),
  ]) {
    assert.equal("pricing" in s, false);
    assert.equal("audiencePricing" in s, false);
    assert.equal("sources" in s.work!, false);
    assert.equal(s.work?.todo, "Доработать");
  }
});
test("work queue can exceed manual target without changing it or counting unknown audiences as both", () => {
  const services: Service[] = Array.from({ length: 130 }, (_, i) => ({
    id: `p${i}`,
    name: `Услуга ${i}`,
    status: "progress",
    audience: "unknown",
  }));
  services.push(existing);
  const data = registrySaveSchema.parse({
    revision: 0,
    date: today(),
    note: "Импорт",
    metrics: { declared: 116 },
    services,
  });
  assert.equal(data.metrics.declared, 116);
  assert.equal(data.metrics.portal, 1);
  assert.equal(data.metrics.progress, 130);
  assert.equal(data.metrics.individual, 1);
  assert.equal(data.metrics.business, 1);
  assert.equal(data.metrics.both, 1);
  assert.equal(metricFilters("progress").status, "progress");
  assert.equal(
    registrySaveSchema.safeParse({ ...data, services: [existing, existing] })
      .success,
    false,
  );
});
test("older editor tabs preserve newly added work properties and append history", () => {
  const work = { todo: "Подключить ЭЦП", comment: "Сохранить" };
  const services = [{ ...existing, work }];
  const input = registrySaveSchema.parse({
    revision: 1,
    date: today(),
    note: "Правка названия",
    metrics: { declared: 116 },
    services: [existing],
  });
  const old: Store = {
    revision: 1,
    services,
    snapshots: [
      {
        id: "s",
        createdAt: "2026-09-08T00:00:00Z",
        date: today(),
        note: "До",
        metrics: input.metrics,
        services,
      },
    ],
  };
  const result = applySave(old, input, "new", new Date().toISOString());
  assert.deepEqual(result.services[0].work, work);
  assert.deepEqual(result.snapshots[0], old.snapshots[0]);
});
