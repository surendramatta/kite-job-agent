import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith("scrypt$")) return false;
  const [, salt, digest] = stored.split("$");
  if (!salt || !digest) return false;
  return safeEqual(scryptSync(password, salt, 64).toString("hex"), digest);
}

function sessionSecret() {
  const secret = process.env.KITE_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("KITE_SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

export function createSessionToken() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `kite:${expires}`;
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${expires}.${signature}`;
}

export function verifySessionToken(token: string) {
  const [expiresRaw, signature] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) || !signature) return false;
  const expected = createHmac("sha256", sessionSecret()).update(`kite:${expires}`).digest("hex");
  return safeEqual(signature, expected);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
