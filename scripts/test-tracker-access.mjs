import assert from "node:assert/strict";
const base = process.env.TEST_APP_URL || "http://127.0.0.1:3010";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Local test only");
const req = (path, method = "GET", body, cookie) =>
  fetch(base + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const login = await req("/api/auth", "POST", {
  password: "local-review-password-2026",
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
const read = async (cookie) => {
  const response = await req("/api/data", "GET", null, cookie);
  assert.equal(response.status, 200);
  return response.json();
};
const before = await read(cookie);
assert.ok(before.services.some((s) => s.pricing));
assert.ok(before.services.some((s) => s.work?.sources?.length));
const isPrivate = (data) => {
  for (const s of [
    ...data.services,
    ...data.snapshots.flatMap((r) => r.services),
  ]) {
    assert.equal("pricing" in s, false);
    assert.equal("audiencePricing" in s, false);
    assert.equal("sources" in (s.work ?? {}), false);
  }
};
isPrivate(await read());
isPrivate(await read("dashboard_session=forged"));
assert.equal((await req("/api/data", "POST", {})).status, 401);
const services = structuredClone(before.services);
const edited = services.find((s) => s.status === "progress");
edited.status = "working";
edited.work.comment = "Local persistence test";
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dushanbe",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const payload = {
  revision: before.revision,
  date,
  note: "Local work tracking test",
  metrics: before.snapshots.at(-1).metrics,
  services,
};
const response = await req("/api/data", "POST", payload, cookie);
assert.equal(response.status, 200);
const after = await response.json();
assert.equal(
  after.snapshots.at(-1).metrics.portal,
  before.snapshots.at(-1).metrics.portal + 1,
);
assert.equal(
  after.snapshots.at(-1).metrics.progress,
  before.snapshots.at(-1).metrics.progress - 1,
);
assert.equal(
  after.services.find((s) => s.id === edited.id).work.comment,
  "Local persistence test",
);
assert.deepEqual(after.services[0].pricing, before.services[0].pricing);
assert.deepEqual(after.snapshots.slice(0, -1), before.snapshots);
assert.equal((await req("/api/data", "POST", payload, cookie)).status, 409);
assert.equal(
  (
    await req(
      "/api/data",
      "POST",
      {
        ...payload,
        revision: after.revision,
        services: before.services,
        note: "Restore local review",
      },
      cookie,
    )
  ).status,
  200,
);
isPrivate(await read());
assert.deepEqual((await read(cookie)).services, before.services);
assert.equal((await req("/api/auth", "DELETE", null, cookie)).status, 200);
isPrivate(await read());
console.log(
  "PASS: guest/forged access redacted across history; admin prices visible; work edits persist; transition recalculates; stale writes rejected; prior reports/prices preserved.",
);
