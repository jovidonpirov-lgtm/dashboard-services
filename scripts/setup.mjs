import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env.local")) {
  console.log(".env.local already exists; left unchanged.");
  process.exit(0);
}
const password = randomBytes(18).toString("base64url");
writeFileSync(
  ".env.local",
  `DATABASE_URL=\nADMIN_PASSWORD=${password}\nSESSION_SECRET=${randomBytes(48).toString("hex")}\n`,
  { mode: 0o600 },
);
writeFileSync(
  "local-access.txt",
  `Локальный вход администратора\nПароль: ${password}\n\nЭтот файл и .env.local исключены из Git.\n`,
  { mode: 0o600 },
);
console.log(
  "Local configuration created. Password is in local-access.txt (not committed).",
);
