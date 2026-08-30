import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "kasa_session";

export function passwordEnabled() {
  return Boolean(process.env.APP_PASSWORD);
}

export function sessionToken() {
  const secret = process.env.APP_PASSWORD;
  if (!secret) return "";
  return createHmac("sha256", secret).update("kasa-session-v1").digest("hex");
}

export function isValidPassword(input: string) {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return true;
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isValidSession(token: string | undefined) {
  if (!passwordEnabled()) return true;
  const expected = sessionToken();
  if (!token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function sessionCookieName() {
  return COOKIE;
}
