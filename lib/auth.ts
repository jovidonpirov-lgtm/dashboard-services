import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
const COOKIE = "dashboard_session";
export const cookieName = COOKIE;
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};
export function configured() {
  return (
    (process.env.ADMIN_PASSWORD?.length ?? 0) >= 16 &&
    (process.env.SESSION_SECRET?.length ?? 0) >= 32
  );
}
function hash(value: string) {
  return createHash("sha256").update(value).digest();
}
export function validPassword(password: string) {
  return (
    configured() &&
    timingSafeEqual(hash(password), hash(process.env.ADMIN_PASSWORD!))
  );
}
function signature(payload: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload + hash(process.env.ADMIN_PASSWORD!).toString("hex"))
    .digest("base64url");
}
export function sessionToken() {
  if (!configured()) throw new Error("AUTH_REQUIRED");
  const payload = String(Date.now() + 12 * 60 * 60 * 1000);
  return `${payload}.${signature(payload)}`;
}
export function validToken(token: string) {
  if (!configured()) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expires = Number(payload);
  if (
    !Number.isFinite(expires) ||
    expires <= Date.now() ||
    expires > Date.now() + 12 * 60 * 60 * 1000
  )
    return false;
  return timingSafeEqual(hash(sig), hash(signature(payload)));
}
export async function isAdmin() {
  return validToken((await cookies()).get(COOKIE)?.value ?? "");
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    // Next.js can normalize request.url to an internal hostname. Host remains
    // the browser's destination and cannot be changed by cross-origin JS.
    const host = request.headers.get("host") || new URL(request.url).host;
    const protocol =
      request.headers.get("x-forwarded-proto") ||
      new URL(request.url).protocol.slice(0, -1);
    return (
      source.origin === origin &&
      source.host === host &&
      source.protocol === `${protocol}:` &&
      ["http:", "https:"].includes(source.protocol)
    );
  } catch {
    return false;
  }
}
