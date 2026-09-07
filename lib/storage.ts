import postgres from "postgres";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { applySave, type Store, type saveSchema } from "./model";
import type { z } from "zod";
const empty = (): Store => ({ revision: 0, services: [], snapshots: [] });
const root = globalThis as unknown as {
  dashboardSql?: ReturnType<typeof postgres>;
  dashboardLock?: Promise<unknown>;
  dashboardAttempts?: Map<string, number>;
};
function sql() {
  if (!process.env.DATABASE_URL) return null;
  return (root.dashboardSql ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}
async function database() {
  const db = sql();
  if (!db) {
    if (process.env.NODE_ENV === "production")
      throw new Error("DATABASE_REQUIRED");
    return null;
  }
  await db`CREATE TABLE IF NOT EXISTS dashboard_state (id integer PRIMARY KEY CHECK (id=1), revision integer NOT NULL, payload jsonb NOT NULL)`;
  await db`INSERT INTO dashboard_state (id,revision,payload) VALUES (1,0,${db.json(empty() as unknown as postgres.JSONValue)}) ON CONFLICT DO NOTHING`;
  return db;
}
const file = () =>
  resolve(process.env.LOCAL_DATA_DIR || ".data", "dashboard.json");
export async function readStore(): Promise<Store> {
  const db = await database();
  if (db) {
    const rows = await db`SELECT payload FROM dashboard_state WHERE id=1`;
    return rows[0].payload as Store;
  }
  try {
    return JSON.parse(await readFile(file(), "utf8")) as Store;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw e;
  }
}
export async function saveStore(
  input: z.infer<typeof saveSchema>,
): Promise<Store> {
  const run = async () => {
    const current = await readStore();
    const next = applySave(
      current,
      input,
      randomUUID(),
      new Date().toISOString(),
    );
    const db = sql();
    if (db) {
      const rows =
        await db`UPDATE dashboard_state SET revision=${next.revision}, payload=${db.json(next as unknown as postgres.JSONValue)} WHERE id=1 AND revision=${input.revision} RETURNING id`;
      if (!rows.length) throw new Error("CONFLICT");
    } else {
      await mkdir(resolve(file(), ".."), { recursive: true });
      const temp = `${file()}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, file());
    }
    return next;
  };
  // Serialize development writes across module reloads; PostgreSQL also uses a revision CAS.
  const pending = (root.dashboardLock ?? Promise.resolve())
    .catch(() => {})
    .then(run);
  root.dashboardLock = pending;
  return pending;
}
export async function allowLogin(): Promise<boolean> {
  const key = String(Math.floor(Date.now() / (15 * 60 * 1000)));
  const db = sql();
  if (db) {
    await db`CREATE TABLE IF NOT EXISTS dashboard_login_attempts (bucket text PRIMARY KEY, attempts integer NOT NULL)`;
    await db`DELETE FROM dashboard_login_attempts WHERE bucket < ${String(Number(key) - 2)}`;
    const rows =
      await db`INSERT INTO dashboard_login_attempts (bucket,attempts) VALUES (${key},1) ON CONFLICT (bucket) DO UPDATE SET attempts=dashboard_login_attempts.attempts+1 RETURNING attempts`;
    return rows[0].attempts <= 20;
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("DATABASE_REQUIRED");
  const attempts = (root.dashboardAttempts ??= new Map());
  for (const k of attempts.keys()) if (k !== key) attempts.delete(k);
  const n = (attempts.get(key) ?? 0) + 1;
  attempts.set(key, n);
  return n <= 20;
}

export async function fileDatabase() {
  const db = await database();
  if (!db) throw new Error("Для вложений требуется подключение PostgreSQL.");
  return db;
}
