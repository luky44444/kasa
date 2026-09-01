import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLedger, getLedger, mergeLedgers, reloadLedger, saveLedger } from "../src/lib/store.ts";
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
    await reloadLedger();
    assert.equal(getLedger().transactions[0]?.id, "from-bak");
  } finally {
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("supabase hydrate loads the cloud ledger", async () => {
  const dir = join(tmpdir(), `kasa-sb-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  process.env.KASA_DATA = join(dir, "kasa.json");
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  const originalFetch = globalThis.fetch;
  const writes: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/rest/v1/kasa_ledger") && method === "GET") {
      return new Response(
        JSON.stringify([
          {
            data: {
              categories: structuredClone(DEFAULT_CATEGORIES),
              transactions: [
                {
                  id: "from-cloud",
                  date: "2026-08-03",
                  direction: "out",
                  currency: "CZK",
                  minor: 200,
                  category: "Food",
                  note: "",
                  createdAt: "2026-08-03T00:00:00.000Z",
                },
              ],
              rate: null,
              settings: { theme: "system" },
              account: {
                email: "you@example.com",
                passwordHash: "aa".repeat(32),
                salt: "bb".repeat(16),
                sessionSecret: "cc".repeat(32),
                createdAt: "2026-08-31T00:00:00.000Z",
                pinHash: "",
                pinSalt: "",
                pinUnlockSecret: "cc".repeat(32),
                pinLastSeen: "",
              },
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/rest/v1/kasa_ledger") && method === "POST") {
      writes.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response("", { status: 201 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await reloadLedger();
    assert.equal(getLedger().transactions[0]?.id, "from-cloud");
    assert.equal(getLedger().account?.email, "you@example.com");
    saveLedger((ledger) => ({
      ...ledger,
      transactions: [
        ...ledger.transactions,
        {
          id: "new-row",
          date: "2026-09-01",
          direction: "out",
          currency: "CZK",
          minor: 100,
          category: "Food",
          note: "",
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    }));
    await flushLedger();
    assert.equal(writes.length, 1);
    const body = writes[0] as { data?: { transactions?: Array<{ id: string }> } };
    assert.equal(body.data?.transactions?.some((row) => row.id === "new-row"), true);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.KASA_STORE_SECRET;
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("empty supabase row uploads a local ledger once", async () => {
  const dir = join(tmpdir(), `kasa-sb-seed-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "kasa.json");
  process.env.KASA_DATA = path;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  writeFileSync(
    path,
    JSON.stringify({
      categories: structuredClone(DEFAULT_CATEGORIES),
      transactions: [
        {
          id: "local-only",
          date: "2026-08-03",
          direction: "out",
          currency: "CZK",
          minor: 100,
          category: "Food",
          note: "",
          createdAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      rate: null,
      settings: { theme: "system" },
      account: null,
    }),
  );
  const originalFetch = globalThis.fetch;
  const writes: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/rest/v1/kasa_ledger") && method === "GET") {
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/rest/v1/kasa_ledger") && method === "POST") {
      writes.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response("", { status: 201 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await reloadLedger();
    assert.equal(getLedger().transactions[0]?.id, "local-only");
    assert.equal((writes[0] as { data?: { transactions?: Array<{ id: string }> } }).data?.transactions?.[0]?.id, "local-only");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.KASA_STORE_SECRET;
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("supabase RPC hydrate uses kasa_load", async () => {
  const dir = join(tmpdir(), `kasa-sb-rpc-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  process.env.KASA_DATA = join(dir, "kasa.json");
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.KASA_STORE_SECRET = "store-secret";
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/rest/v1/rpc/kasa_load")) {
      return new Response(
        JSON.stringify({
          categories: structuredClone(DEFAULT_CATEGORIES),
          transactions: [
            {
              id: "from-rpc",
              date: "2026-08-03",
              direction: "out",
              currency: "CZK",
              minor: 200,
              category: "Food",
              note: "",
              createdAt: "2026-08-03T00:00:00.000Z",
            },
          ],
          rate: null,
          settings: { theme: "system" },
          account: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await reloadLedger();
    assert.equal(getLedger().transactions[0]?.id, "from-rpc");
    assert.equal(calls.some((item) => item.includes("rpc/kasa_load")), true);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.KASA_STORE_SECRET;
    await flushLedger();
    rmSync(dir, { recursive: true, force: true });
  }
});
