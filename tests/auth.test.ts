import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { hashPassword, validatePin, validatePassword } from "../src/lib/auth.ts";
import { parseAccount } from "../src/lib/money.ts";

test("PIN validation", () => {
  assert.equal(validatePin("1234"), "1234");
  assert.equal(validatePin("123456"), "123456");
  assert.equal("error" in validatePin("123"), true);
  assert.equal("error" in validatePin("abcdef"), true);
});

test("legacy password validation still works", () => {
  assert.equal(typeof validatePassword("long-enough"), "string");
  assert.equal("error" in validatePassword("short"), true);
});

test("scrypt hash is deterministic and not plaintext", async () => {
  const salt = randomBytes(16);
  const hash = await hashPassword("1234", salt);
  const again = await hashPassword("1234", salt);
  assert.equal(hash.toString("hex"), again.toString("hex"));
  assert.notEqual(hash.toString("utf8"), "1234");
  const other = await hashPassword("9999", salt);
  assert.notEqual(hash.toString("hex"), other.toString("hex"));
});

test("parseAccount rejects junk and plaintext fields", () => {
  assert.equal(parseAccount(null), null);
  assert.equal(parseAccount({ pin: "1234" }), null);
  assert.equal(
    parseAccount({
      passwordHash: "aa".repeat(32),
      salt: "bb".repeat(16),
      sessionSecret: "cc".repeat(32),
      createdAt: "2026-08-30T00:00:00.000Z",
    })?.passwordHash,
    "aa".repeat(32),
  );
});
