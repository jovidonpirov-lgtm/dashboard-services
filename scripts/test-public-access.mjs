import assert from "node:assert/strict";
const base = process.env.TEST_APP_URL || "http://127.0.0.1:3010";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Use an isolated local preview");
const req = (path, method = "GET", body, cookie) =>
  fetch(base + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const beforeResponse = await req("/api/data");
assert.equal(beforeResponse.status, 200);
assert.match(beforeResponse.headers.get("cache-control"), /no-store/);
const before = await beforeResponse.json();
assert.equal((await req("/api/data", "POST", {})).status, 401);
assert.equal(
  (await req("/api/data", "POST", {}, "dashboard_session=forged")).status,
  401,
);
assert.equal((await req("/api/files", "POST", {})).status, 401);
const login = await req("/api/auth", "POST", {
  password: "local-review-password-2026",
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
assert.ok(cookie);
const admin = await (await req("/api/auth", "GET", undefined, cookie)).json();
assert.equal(admin.admin, true);
const privateData = await (await req("/api/data", "GET", undefined, cookie)).json();
assert.equal(privateData.revision, before.revision);
assert.equal(privateData.services.length, before.services.length);
for (const service of [...before.services, ...before.snapshots.flatMap((s) => s.services)]) {
  assert.equal("pricing" in service, false);
  assert.equal("audiencePricing" in service, false);
  assert.equal("sources" in (service.work ?? {}), false);
}
assert.equal((await req("/api/auth", "DELETE", undefined, cookie)).status, 200);
assert.deepEqual(await (await req("/api/data")).json(), before);
console.log(
  "Public counts match admin; confidential fields are absent; logout preserves public access; anonymous and forged writes rejected; data unchanged.",
);
