import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLedger, getLedger, mergeLedgers, reloadLedger } from "../src/lib/store.ts";
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

test("empty file restores transactions from .bak", async () => {
  const dir = join(tmpdir(), `kasa-bak-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "kasa.json");
  process.env.KASA_DATA = path;
  const empty = {
    categories: structuredClone(DEFAULT_CATEGORIES),
    transactions: [],
    rate: null,
    settings: { theme: "system" },
    account: null,
  };
  writeFileSync(path, JSON.stringify(empty));
  writeFileSync(
    `${path}.bak`,
    JSON.stringify({
      ...empty,
      transactions: [
        {
          id: "from-bak",
          date: "2026-08-03",
          direction: "out",
          currency: "CZK",
          minor: 500,
          category: "Food",
          note: "",
          createdAt: "2026-08-03T00:00:00.000Z",
        },
      ],
    }),
  );
  try {
    reloadLedger();
    assert.equal(getLedger().transactions[0]?.id, "from-bak");
  } finally {
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});
