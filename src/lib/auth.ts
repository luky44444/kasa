import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Account } from "./money.ts";
import { getLedger, reloadLedger, saveLedger } from "./store.ts";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "kasa_session";
const UNLOCK_COOKIE = "kasa_unlock";
const KEYLEN = 32;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const PIN_IDLE_MS = 5 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function unlockCookieName() {
  return UNLOCK_COOKIE;
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

export function validatePin(raw: string) {
  const pin = String(raw ?? "").trim();
  if (!/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4–6 digits" };
  return pin;
}

export async function hashPassword(secret: string, salt: Buffer) {
  return (await scryptAsync(secret, salt, KEYLEN, SCRYPT)) as Buffer;
}

function hmacToken(secretHex: string, label: string) {
  return createHmac("sha256", Buffer.from(secretHex, "hex")).update(label).digest("hex");
}

export function sessionToken(account: Account) {
  return hmacToken(account.sessionSecret, "kasa-session-v1");
}

export function unlockToken(account: Account) {
  if (!account.pinUnlockSecret) return "";
  return hmacToken(account.pinUnlockSecret, "kasa-unlock-v1");
}

function tokenEquals(left: string | undefined, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function hasEmail(account: Account | null) {
  return Boolean(account?.email && EMAIL_RE.test(account.email));
}

function hasPin(account: Account | null) {
  return Boolean(account?.pinHash && account.pinSalt);
}

export function hasAccount() {
  return Boolean(getLedger().account);
}

export function isValidSession(token: string | undefined) {
  const account = getLedger().account;
  if (!account || !token) return false;
  return tokenEquals(token, sessionToken(account));
}

function pinStillFresh(account: Account) {
  const last = Date.parse(account.pinLastSeen || "");
  return Number.isFinite(last) && Date.now() - last <= PIN_IDLE_MS;
}

export function isUnlocked(session: string | undefined, unlock: string | undefined) {
  const account = getLedger().account;
  if (!isValidSession(session) || !account) return false;
  if (!hasPin(account)) return true;
  return tokenEquals(unlock, unlockToken(account)) && pinStillFresh(account);
}

export function authStatus(session?: string, unlock?: string) {
  const account = getLedger().account;
  const loggedIn = isValidSession(session);
  const pinReady = hasPin(account);
  return {
    registered: Boolean(account),
    hasPin: pinReady,
    loggedIn,
    unlocked: isUnlocked(session, unlock),
  };
}

export function gateLocation(session?: string, unlock?: string) {
  const status = authStatus(session, unlock);
  if (!status.registered) return "/register";
  if (!status.loggedIn) return "/login";
  if (status.hasPin && !status.unlocked) return "/pin";
  return "/";
}

export function touchPin() {
  saveLedger((ledger) => {
    if (!ledger.account) return ledger;
    return { ...ledger, account: { ...ledger.account, pinLastSeen: new Date().toISOString() } };
  });
}

function withUnlock(account: Account): Account {
  return {
    ...account,
    pinUnlockSecret: randomBytes(32).toString("hex"),
    pinLastSeen: new Date().toISOString(),
  };
}

export function lockPin() {
  saveLedger((ledger) => {
    if (!ledger.account) return ledger;
    return {
      ...ledger,
      account: {
        ...ledger.account,
        pinUnlockSecret: randomBytes(32).toString("hex"),
        pinLastSeen: "",
      },
    };
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
        pinUnlockSecret: randomBytes(32).toString("hex"),
        pinLastSeen: "",
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

async function hashesMatch(secret: string, hashHex: string, saltHex: string) {
  const derived = await hashPassword(secret.slice(0, 128), Buffer.from(saltHex, "hex"));
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
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

export async function registerAccount(emailRaw: string, passwordRaw: string) {
  reloadLedger();
  if (getLedger().account) {
    return { error: "An account already exists. Log in instead.", status: 409 as const };
  }
  const email = validateEmail(emailRaw);
  if (typeof email !== "string") return { ...email, status: 400 as const };
  const password = validatePassword(passwordRaw);
  if (typeof password !== "string") return { ...password, status: 400 as const };

  const salt = randomBytes(16);
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  const account: Account = {
    email,
    passwordHash: passwordHash.toString("hex"),
    salt: salt.toString("hex"),
    sessionSecret: randomBytes(32).toString("hex"),
    createdAt: now,
    pinHash: "",
    pinSalt: "",
    pinUnlockSecret: randomBytes(32).toString("hex"),
    pinLastSeen: "",
  };
  saveLedger((ledger) => ({ ...ledger, account }));
  return { token: sessionToken(account), hasPin: false };
}

export async function loginAccount(emailRaw: string, passwordRaw: string) {
  reloadLedger();
  const password = typeof passwordRaw === "string" ? passwordRaw.slice(0, 128) : "";
  const account = getLedger().account;
  if (!account) {
    await hashPassword(password || "x", Buffer.alloc(16));
    return { error: "Wrong email or password", status: 401 as const };
  }

  const email = validateEmail(emailRaw);
  if (typeof email !== "string") {
    await hashPassword(password || "x", Buffer.alloc(16));
    return { error: "Wrong email or password", status: 401 as const };
  }

  const passwordOk = await hashesMatch(password, account.passwordHash, account.salt);
  const storedEmail = hasEmail(account);
  const emailOk = storedEmail ? timingSafeEqualStr(email, account.email) : true;
  if (!passwordOk || !emailOk) {
    return { error: "Wrong email or password", status: 401 as const };
  }

  let next = account;
  let changed = false;
  if (!storedEmail) {
    next = { ...next, email };
    changed = true;
  }
  const pinReady = hasPin(next);
  if (pinReady) {
    next = withUnlock(next);
    changed = true;
  }
  if (changed) saveLedger((ledger) => ({ ...ledger, account: next }));
  return { token: sessionToken(next), hasPin: pinReady, unlock: pinReady ? unlockToken(next) : "" };
}

export async function setPin(pinRaw: string) {
  const pin = validatePin(pinRaw);
  if (typeof pin !== "string") return { ...pin, status: 400 as const };
  const account = getLedger().account;
  if (!account) return { error: "Log in first", status: 401 as const };
  const salt = randomBytes(16);
  const pinHash = await hashPassword(pin, salt);
  const next: Account = withUnlock({
    ...account,
    pinHash: pinHash.toString("hex"),
    pinSalt: salt.toString("hex"),
  });
  saveLedger((ledger) => ({ ...ledger, account: next }));
  return { unlock: unlockToken(next) };
}

export async function unlockPin(pinRaw: string) {
  const pin = validatePin(pinRaw);
  if (typeof pin !== "string") return { ...pin, status: 400 as const };
  const account = getLedger().account;
  if (!account || !hasPin(account)) {
    await hashPassword(pin || "0000", Buffer.alloc(16));
    return { error: "Create a PIN first", status: 401 as const };
  }
  const ok = await hashesMatch(pin, account.pinHash, account.pinSalt);
  if (!ok) return { error: "Wrong PIN", status: 401 as const };
  const next: Account = withUnlock(account);
  saveLedger((ledger) => ({ ...ledger, account: next }));
  return { unlock: unlockToken(next) };
}
