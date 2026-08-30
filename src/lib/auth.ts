import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Account } from "./money.ts";
import { getLedger, saveLedger } from "./store.ts";

const scryptAsync = promisify(scrypt);
const COOKIE = "kasa_session";
const KEYLEN = 32;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function sessionCookieName() {
  return COOKIE;
}

export function hasAccount() {
  return Boolean(getLedger().account);
}

export function authStatus() {
  return { registered: hasAccount() };
}

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string) {
  const email = normalizeEmail(raw);
  if (email.length < 5 || email.length > 254 || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email" };
  }
  return email;
}

export function validatePassword(raw: string) {
  if (typeof raw !== "string" || raw.length < 10) {
    return { error: "Password must be at least 10 characters" };
  }
  if (raw.length > 128) return { error: "Password is too long" };
  return raw;
}

export async function hashPassword(password: string, salt: Buffer) {
  return (await scryptAsync(password, salt, KEYLEN, SCRYPT)) as Buffer;
}

export function sessionToken(account: Account) {
  return createHmac("sha256", Buffer.from(account.sessionSecret, "hex"))
    .update("kasa-session-v1")
    .digest("hex");
}

export function isValidSession(token: string | undefined) {
  const account = getLedger().account;
  if (!account || !token) return false;
  const expected = sessionToken(account);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function timingSafeEqualStr(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

export function allowAttempt(ip: string, limit = 20, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const key = ip || "unknown";
  let bucket = attempts.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    attempts.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export async function registerAccount(emailRaw: string, passwordRaw: string) {
  if (hasAccount()) {
    return { error: "An account already exists. Log in instead.", status: 409 as const };
  }
  const email = validateEmail(emailRaw);
  if (typeof email !== "string") return { ...email, status: 400 as const };
  const password = validatePassword(passwordRaw);
  if (typeof password !== "string") return { ...password, status: 400 as const };

  const salt = randomBytes(16);
  const passwordHash = await hashPassword(password, salt);
  const account: Account = {
    email,
    passwordHash: passwordHash.toString("hex"),
    salt: salt.toString("hex"),
    sessionSecret: randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  saveLedger((ledger) => ({ ...ledger, account }));
  return { token: sessionToken(account) };
}

export async function loginAccount(emailRaw: string, passwordRaw: string) {
  const password = typeof passwordRaw === "string" ? passwordRaw.slice(0, 128) : "";
  const account = getLedger().account;
  if (!account) {
    await hashPassword(password || "x", Buffer.alloc(16));
    return { error: "Create an account first", status: 401 as const };
  }

  const derived = await hashPassword(password, Buffer.from(account.salt, "hex"));
  const expected = Buffer.from(account.passwordHash, "hex");
  const hashOk = derived.length === expected.length && timingSafeEqual(derived, expected);
  const emailOk = timingSafeEqualStr(normalizeEmail(emailRaw), account.email);
  if (!hashOk || !emailOk) {
    return { error: "Wrong email or password", status: 401 as const };
  }
  return { token: sessionToken(account) };
}
