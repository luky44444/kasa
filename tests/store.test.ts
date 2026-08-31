import assert from "node:assert/strict";
import test from "node:test";
import { mergeLedgers } from "../src/lib/store.ts";
import { DEFAULT_CATEGORIES } from "../src/lib/money.ts";

test("PIN save must not drop transactions already on disk", () => {
  const disk = {
    categories: structuredClone(DEFAULT_CATEGORIES),
    transactions: [
      {
        id: "keep-me",
        date: "2026-08-03",
        direction: "out" as const,
        currency: "CZK" as const,
        minor: 1000,
        category: "Food",
        note: "Albert",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
    ],
    rate: null,
    settings: { theme: "system" as const },
    account: null,
  };
  const next = {
    ...disk,
    transactions: [],
    account: {
      email: "",
      passwordHash: "aa".repeat(32),
      salt: "bb".repeat(16),
      sessionSecret: "cc".repeat(32),
      createdAt: "2026-08-31T00:00:00.000Z",
      pinHash: "",
      pinSalt: "",
      pinUnlockSecret: "cc".repeat(32),
      pinLastSeen: "",
    },
  };
  const merged = mergeLedgers(disk, next);
  assert.equal(merged.transactions.length, 1);
  assert.equal(merged.transactions[0].id, "keep-me");
  assert.equal(merged.account?.sessionSecret, "cc".repeat(32));
});
