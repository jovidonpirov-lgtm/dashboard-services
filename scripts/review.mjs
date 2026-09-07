// Isolated preview: never inherits production database or object storage settings.
import { spawn } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
const dir = resolve(".data/ux-review");
await mkdir(dir, { recursive: true });
try {
  await access(resolve(dir, "dashboard.json"));
} catch {
  const seed = spawn(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      'import {demoStore} from "./lib/demo"; import {writeFileSync} from "node:fs"; writeFileSync(".data/ux-review/dashboard.json", JSON.stringify(demoStore()))',
    ],
    { stdio: "inherit" },
  );
  if (await new Promise((resolve) => seed.on("exit", resolve))) process.exit(1);
}
const env = {
  ...process.env,
  DATABASE_URL: "",
  LOCAL_DATA_DIR: dir,
  NEXT_LOCAL_REVIEW: "1",
  ADMIN_PASSWORD: "local-review-password-2026",
  SESSION_SECRET: "local-review-session-secret-for-testing-2026",
};
for (const name of [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
])
  env[name] = "";
const server = spawn("pnpm", ["dev", "--port", "3010"], {
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
