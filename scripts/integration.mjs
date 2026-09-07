import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import postgres from "postgres";
const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error(
    "Provide a separate TEST_DATABASE_URL whose database name ends in _test.",
  );
const db = postgres(databaseURL, { max: 2 });
const origin = "http://127.0.0.1:3107";
const password = randomBytes(24).toString("hex");
const secret = randomBytes(48).toString("hex");
let output = "";
let count = 0;
let server;
function ok(message) {
  count++;
  console.log(`PASS ${message}`);
}
async function request(
  path,
  method = "GET",
  body,
  cookie,
  customOrigin = origin,
) {
  return fetch(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(method !== "GET" ? { Origin: customOrigin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
try {
  await db`DROP TABLE IF EXISTS dashboard_state`;
  await db`DROP TABLE IF EXISTS dashboard_login_attempts`;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3107",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: databaseURL,
        ADMIN_PASSWORD: password,
        SESSION_SECRET: secret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (b) => {
    output += b;
  });
  server.stderr.on("data", (b) => {
    output += b;
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null)
      throw new Error("Server failed to start: " + output);
    try {
      const response = await request("/api/auth");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Server ready");
  assert.equal((await request("/")).status, 200);
  ok("production page responds");
  assert.equal((await request("/api/data")).status, 401);
  ok("private data requires login");
  assert.equal(
    (
      await request(
        "/api/auth",
        "POST",
        { password },
        undefined,
        "https://untrusted.invalid",
      )
    ).status,
    403,
  );
  ok("cross-origin login blocked");
  assert.equal(
    (await request("/api/auth", "POST", { password: "incorrect" })).status,
    401,
  );
  ok("incorrect password rejected");
  const login = await request("/api/auth", "POST", { password });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=strict/i);
  const cookie = setCookie.split(";")[0];
  ok("login sets protected cookie");
  const initial = await (
    await request("/api/data", "GET", undefined, cookie)
  ).json();
  assert.equal(initial.revision, 0);
  assert.equal(initial.snapshots.length, 0);
  ok("real database is empty, no demo data");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dushanbe",
  }).format(new Date());
  const payload = {
    revision: 0,
    date,
    note: "Integration test report",
    metrics: { declared: 2, working: 1, individual: 1, business: 1 },
    services: [
      {
        id: "TEST-1",
        name: "Тестовая услуга",
        audience: "individual",
        status: "working",
      },
    ],
  };
  assert.equal((await request("/api/data", "POST", payload)).status, 401);
  ok("anonymous write blocked");
  assert.equal(
    (
      await request(
        "/api/data",
        "POST",
        payload,
        cookie,
        "https://untrusted.invalid",
      )
    ).status,
    403,
  );
  ok("cross-origin write blocked");
  const invalid = await request(
    "/api/data",
    "POST",
    { ...payload, metrics: { ...payload.metrics, working: 3 } },
    cookie,
  );
  assert.equal(invalid.status, 400);
  ok("invalid counts rejected on server");
  const save = await request("/api/data", "POST", payload, cookie);
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.snapshots.length, 1);
  ok("report saved to PostgreSQL");
  const reread = await (
    await request("/api/data", "GET", undefined, cookie)
  ).json();
  assert.deepEqual(reread, saved);
  ok("saved report survives fresh read");
  const pgRows =
    await db`SELECT revision,payload FROM dashboard_state WHERE id=1`;
  assert.equal(pgRows[0].revision, 1);
  assert.equal(pgRows[0].payload.snapshots[0].services[0].id, "TEST-1");
  ok("durable database contents verified");
  const writes = await Promise.all([
    request(
      "/api/data",
      "POST",
      { ...payload, revision: 1, note: "Concurrent one" },
      cookie,
    ),
    request(
      "/api/data",
      "POST",
      { ...payload, revision: 1, note: "Concurrent two" },
      cookie,
    ),
  ]);
  assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
  ok("concurrent stale write rejected atomically");
  const previous = new Date(date + "T12:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  const backdated = await request(
    "/api/data",
    "POST",
    {
      ...payload,
      revision: 2,
      date: previous.toISOString().slice(0, 10),
      services: [],
      note: "Backdated test",
    },
    cookie,
  );
  assert.equal(backdated.status, 200);
  const history = await backdated.json();
  assert.equal(history.snapshots.length, 3);
  assert.equal(history.services[0].id, "TEST-1");
  assert.equal(history.snapshots[0].note, "Integration test report");
  ok("backdated report preserves latest registry and original history");
  const forged = cookie.slice(0, -1) + (cookie.endsWith("a") ? "b" : "a");
  assert.equal(
    (await request("/api/data", "GET", undefined, forged)).status,
    401,
  );
  ok("forged session rejected");
  const logout = await request("/api/auth", "DELETE", undefined, cookie);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/i);
  ok("logout clears cookie");
  let rateResponse;
  for (let i = 0; i < 20; i++)
    rateResponse = await request("/api/auth", "POST", { password: "wrong" });
  assert.equal(rateResponse.status, 429);
  ok("database-backed login rate limit enforced");
  console.log(`Integration checks passed: ${count}`);
} finally {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", resolve);
    });
  }
  await db`DROP TABLE IF EXISTS dashboard_state`;
  await db`DROP TABLE IF EXISTS dashboard_login_attempts`;
  await db.end();
}
