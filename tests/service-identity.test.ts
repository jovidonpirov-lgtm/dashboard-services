import { test } from "node:test";
import assert from "node:assert/strict";
import { registryIdFor } from "../lib/service-identity";
import { publicService } from "../lib/public-data";
import {
  serviceSchema,
  registrySaveSchema,
  applySave,
  today,
  type Service,
  type Store,
} from "../lib/model";

const service: Service = {
  id: "TRK-technical",
  name: "Подуслуга",
  status: "progress",
  audience: "unknown",
  work: {
    sources: [
      {
        file: "tracker.xlsx",
        sheet: "Трекер",
        row: 3,
        cells: { "ID реестра": "000047", Оплата: "Частные данные" },
      },
    ],
  },
};
test("registry IDs preserve leading zeros and remain visible after removing private source rows", () => {
  const before = JSON.stringify(service);
  assert.equal(registryIdFor(service), "000047");
  const guest = publicService(service);
  assert.equal(registryIdFor(guest), "000047");
  assert.equal(guest.id, service.id);
  assert.equal(guest.work?.sources, undefined);
  assert.equal(JSON.stringify(service), before);
});
test("absent source IDs stay unknown, numeric source codes stay exact, generated IDs are hidden", () => {
  const edit = (id: string | null) => ({
    ...service,
    work: {
      sources: [{ ...service.work!.sources![0], cells: { "ID реестра": id } }],
    },
  });
  assert.equal(registryIdFor(edit(null)), "");
  assert.equal(registryIdFor(publicService(edit(null))), "");
  assert.equal(registryIdFor(edit("586")), "586");
  assert.equal(registryIdFor({ ...service, work: undefined }), "");
  assert.equal(
    registryIdFor({ ...service, id: "000527-2", work: undefined }),
    "000527-2",
  );
});
test("shared registry code is allowed for different service and attachment identities", () => {
  const rows = [
    service,
    { ...service, id: "TRK-second", name: "Вторая подуслуга" },
  ].map((s) => serviceSchema.parse({ ...s, registryId: registryIdFor(s) }));
  const data = registrySaveSchema.parse({
    revision: 0,
    date: today(),
    note: "Две подуслуги",
    metrics: { declared: 116 },
    services: rows,
  });
  assert.equal(data.services[0].registryId, data.services[1].registryId);
  assert.notEqual(data.services[0].id, data.services[1].id);
});
test("editing or clearing a registry ID leaves internal identity and original source unchanged", () => {
  const edited = serviceSchema.parse({ ...service, registryId: "000999" });
  assert.equal(registryIdFor(edited), "000999");
  assert.equal(edited.id, service.id);
  assert.deepEqual(edited.work, service.work);
  assert.equal(registryIdFor({ ...edited, registryId: null }), "");
});
test("old clients preserve saved registry IDs without rewriting history", () => {
  const stored = { ...service, registryId: "000999" };
  const input = registrySaveSchema.parse({
    revision: 1,
    date: today(),
    note: "Правка",
    metrics: { declared: 116 },
    services: [service],
  });
  const store: Store = {
    revision: 1,
    services: [stored],
    snapshots: [
      {
        id: "old",
        date: today(),
        createdAt: "2026-09-08T00:00:00Z",
        note: "Исходный",
        metrics: input.metrics,
        services: [stored],
      },
    ],
  };
  const next = applySave(store, input, "new", new Date().toISOString());
  assert.equal(next.services[0].registryId, "000999");
  assert.deepEqual(next.snapshots[0], store.snapshots[0]);
});
