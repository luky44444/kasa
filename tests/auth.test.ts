import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { hashPassword, validateEmail, validatePassword, validatePin } from "../src/lib/auth.ts";
import { parseAccount } from "../src/lib/money.ts";

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
