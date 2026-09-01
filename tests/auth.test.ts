import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gateLocation,
  hashPassword,
  isUnlocked,
  lockPin,
  loginAccount,
  registerAccount,
  setPin,
  validateEmail,
  validatePassword,
  validatePin,
} from "../src/lib/auth.ts";
import { parseAccount } from "../src/lib/money.ts";
import { flushLedger, getLedger, reloadLedger, saveLedger } from "../src/lib/store.ts";

test("email validation", () => {
  assert.equal(validateEmail("you@example.com"), "you@example.com");
  assert.equal(validateEmail("  You@Example.COM  "), "you@example.com");
  assert.equal("error" in validateEmail("not-an-email"), true);
});

test("password validation", () => {
  assert.equal(typeof validatePassword("long-enough"), "string");
  assert.equal("error" in validatePassword("short"), true);
});

test("PIN validation", () => {
  assert.equal(validatePin("1234"), "1234");
  assert.equal("error" in validatePin("12"), true);
});

test("scrypt hash is deterministic and not plaintext", async () => {
  const salt = randomBytes(16);
  const hash = await hashPassword("correct-horse", salt);
  const again = await hashPassword("correct-horse", salt);
  assert.equal(hash.toString("hex"), again.toString("hex"));
  assert.notEqual(hash.toString("utf8"), "correct-horse");
});

test("parseAccount rejects junk and plaintext fields", () => {
  assert.equal(parseAccount(null), null);
  assert.equal(parseAccount({ email: "a@b.c", password: "secret" }), null);
  assert.equal(
    parseAccount({
      email: "you@example.com",
      passwordHash: "aa".repeat(32),
      salt: "bb".repeat(16),
      sessionSecret: "cc".repeat(32),
      createdAt: "2026-08-30T00:00:00.000Z",
    })?.email,
    "you@example.com",
  );
});

test("register once, then login opens the ledger without a PIN", async () => {
  const dir = join(tmpdir(), `kasa-auth-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  process.env.KASA_DATA = join(dir, "kasa.json");
  reloadLedger();
  try {
    assert.equal(gateLocation(), "/register");
    const created = await registerAccount("you@example.com", "correct-horse");
    assert.equal("token" in created, true);
    if (!("token" in created)) throw new Error("expected token");
    assert.equal(created.hasPin, false);
    assert.equal(gateLocation(created.token), "/");
    assert.equal(isUnlocked(created.token, undefined), true);

    const again = await registerAccount("other@example.com", "another-long");
    assert.equal("status" in again && again.status, 409);

    const login = await loginAccount("you@example.com", "correct-horse");
    assert.equal("token" in login, true);
    if (!("token" in login)) throw new Error("expected token");
    assert.equal(login.hasPin, false);
    assert.equal(isUnlocked(login.token, undefined), true);

    const wrong = await loginAccount("you@example.com", "nope-nope-nope");
    assert.equal("status" in wrong && wrong.status, 401);
    const wrongEmail = await loginAccount("nope@example.com", "correct-horse");
    assert.equal("status" in wrongEmail && wrongEmail.status, 401);
  } finally {
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PIN-only leftover cannot register again; login attaches email", async () => {
  const dir = join(tmpdir(), `kasa-pin-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  process.env.KASA_DATA = join(dir, "kasa.json");
  reloadLedger();
  try {
    const salt = randomBytes(16);
    const passwordHash = await hashPassword("1234", salt);
    saveLedger((ledger) => ({
      ...ledger,
      transactions: [
        {
          id: "keep-me",
          date: "2026-08-03",
          direction: "out",
          currency: "CZK",
          minor: 1000,
          category: "Food",
          note: "Albert",
          createdAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      account: {
        email: "",
        passwordHash: passwordHash.toString("hex"),
        salt: salt.toString("hex"),
        sessionSecret: randomBytes(32).toString("hex"),
        createdAt: "2026-08-31T00:00:00.000Z",
        pinHash: "",
        pinSalt: "",
        pinUnlockSecret: randomBytes(32).toString("hex"),
        pinLastSeen: "",
      },
    }));
    await flushLedger();
    reloadLedger();

    const blocked = await registerAccount("you@example.com", "correct-horse");
    assert.equal("status" in blocked && blocked.status, 409);

    const login = await loginAccount("you@example.com", "1234");
    assert.equal("token" in login, true);
    assert.equal(getLedger().account?.email, "you@example.com");
    assert.equal(getLedger().transactions.some((row) => row.id === "keep-me"), true);
  } finally {
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("email login unlocks a PIN lock", async () => {
  const dir = join(tmpdir(), `kasa-unlock-login-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  process.env.KASA_DATA = join(dir, "kasa.json");
  reloadLedger();
  try {
    const created = await registerAccount("you@example.com", "correct-horse");
    assert.equal("token" in created, true);
    if (!("token" in created)) throw new Error("expected token");
    const pin = await setPin("2468");
    assert.equal("unlock" in pin, true);
    if (!("unlock" in pin)) throw new Error("expected unlock");
    lockPin();
    assert.equal(gateLocation(created.token, pin.unlock), "/pin");
    assert.equal(isUnlocked(created.token, pin.unlock), false);

    const login = await loginAccount("you@example.com", "correct-horse");
    assert.equal("token" in login, true);
    assert.equal("unlock" in login && login.unlock.length > 0, true);
    if (!("token" in login) || !("unlock" in login)) throw new Error("expected unlock");
    assert.equal(login.hasPin, true);
    assert.equal(isUnlocked(login.token, login.unlock), true);
    assert.equal(gateLocation(login.token, login.unlock), "/");
  } finally {
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});
