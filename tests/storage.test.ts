import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStore, saveStore } from "../lib/storage";
import { today } from "../lib/model";
test("local persistence is durable and rejects competing revisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dashboard-local-test-"));
  const original = {
    DATABASE_URL: process.env.DATABASE_URL,
    LOCAL_DATA_DIR: process.env.LOCAL_DATA_DIR,
    NODE_ENV: process.env.NODE_ENV,
  };
  Object.assign(process.env, {
    DATABASE_URL: "",
    LOCAL_DATA_DIR: dir,
    NODE_ENV: "test",
  });
  try {
    assert.equal((await readStore()).revision, 0);
    const input = {
      revision: 0,
      date: today(),
      note: "Local test",
      metrics: { declared: 0, working: 0, individual: 0, business: 0 },
      services: [],
    };
    const result = await Promise.allSettled([
      saveStore(input),
      saveStore(input),
    ]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(result.filter((r) => r.status === "rejected").length, 1);
    const stored = await readStore();
    assert.equal(stored.revision, 1);
    assert.equal(stored.snapshots.length, 1);
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "dashboard.json"), "utf8")),
      stored,
    );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
