import { test } from "node:test";
import assert from "node:assert/strict";
import { registerAnalysisTools, type ModelContext } from "../lib/agent-tools";
import { demoStore } from "../lib/demo";
import { today } from "../lib/model";
test("analysis tools expose current dataset, validate input, and unregister", () => {
  const tools: Parameters<ModelContext["registerTool"]>[0][] = [];
  const signals: AbortSignal[] = [];
  let data = { store: demoStore(), demo: true };
  const close = registerAnalysisTools(
    {
      registerTool(tool, options) {
        tools.push(tool);
        signals.push(options.signal);
      },
    },
    () => data,
  );
  assert.deepEqual(
    tools.map((t) => t.name),
    ["read_service_dashboard", "compare_service_period"],
  );
  assert.equal((tools[0].execute({}) as { demo: boolean }).demo, true);
  assert.ok(tools.every((t) => t.annotations.readOnlyHint));
  assert.throws(() => tools[1].execute({ from: "wrong", to: today() }));
  data = { store: { revision: 0, services: [], snapshots: [] }, demo: false };
  assert.equal((tools[0].execute({}) as { metrics: unknown }).metrics, null);
  assert.equal(
    (tools[1].execute({ from: today(), to: today() }) as { change: unknown })
      .change,
    null,
  );
  close();
  assert.ok(signals.every((s) => s.aborted));
});
