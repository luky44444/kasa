import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Account } from "./money.ts";
import { getLedger, reloadLedger, saveLedger } from "./store.ts";

const scryptAsync = promisify(scrypt);
const COOKIE = "kasa_session";
const KEYLEN = 32;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_IDLE_MS = 5 * 60 * 1000;

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

export function validatePin(raw: string) {
  const pin = String(raw ?? "").trim();
  if (!/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4–6 digits" };
  return pin;
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

function withinIdleWindow(account: Account) {
  const last = Date.parse(account.lastSeen || "");
  return Number.isFinite(last) && Date.now() - last <= SESSION_IDLE_MS;
}

export function isValidSession(token: string | undefined) {
  const account = getLedger().account;
  if (!account || !token || !withinIdleWindow(account)) return false;
  const expected = sessionToken(account);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function touchSession() {
  saveLedger((ledger) => {
    if (!ledger.account) return ledger;
    return { ...ledger, account: { ...ledger.account, lastSeen: new Date().toISOString() } };
  });
}

export function clearSession() {
  saveLedger((ledger) => {
    if (!ledger.account) return ledger;
    return {
      ...ledger,
      account: {
        ...ledger.account,
        sessionSecret: randomBytes(32).toString("hex"),
        lastSeen: "",
      },
    };
  });
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

async function hashesMatch(secret: string, account: Account) {
  const derived = await hashPassword(secret.slice(0, 128), Buffer.from(account.salt, "hex"));
  const expected = Buffer.from(account.passwordHash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export async function registerAccount(pinRaw: string) {
  reloadLedger();
  if (hasAccount()) {
    return { error: "A PIN already exists. Unlock instead.", status: 409 as const };
  }
  const pin = validatePin(pinRaw);
  if (typeof pin !== "string") return { ...pin, status: 400 as const };

  const salt = randomBytes(16);
  const passwordHash = await hashPassword(pin, salt);
  const now = new Date().toISOString();
  const account: Account = {
    email: "",
    passwordHash: passwordHash.toString("hex"),
    salt: salt.toString("hex"),
    sessionSecret: randomBytes(32).toString("hex"),
    createdAt: now,
    lastSeen: now,
  };
  saveLedger((ledger) => ({ ...ledger, account }));
  return { token: sessionToken(account) };
}

export async function loginAccount(pinRaw: string) {
  reloadLedger();
  const secret = typeof pinRaw === "string" ? pinRaw.slice(0, 128) : "";
  const account = getLedger().account;
  if (!account) {
    await hashPassword(secret || "0000", Buffer.alloc(16));
    return { error: "Create a PIN first", status: 401 as const };
  }

  const pin = validatePin(secret);
  const asPin = typeof pin === "string" ? pin : "";
  const legacy = validatePassword(secret);
  const asPassword = typeof legacy === "string" ? legacy : "";
  const ok = (asPin && (await hashesMatch(asPin, account))) || (asPassword && (await hashesMatch(asPassword, account)));
  if (!ok) {
    if (!asPin && !asPassword) return { error: "PIN must be 4–6 digits", status: 400 as const };
    return { error: "Wrong PIN", status: 401 as const };
  }
  const next: Account = {
    ...account,
    sessionSecret: randomBytes(32).toString("hex"),
    lastSeen: new Date().toISOString(),
  };
  saveLedger((ledger) => ({ ...ledger, account: next }));
  return { token: sessionToken(next) };
}
