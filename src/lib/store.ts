import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  parseAccount,
  DEFAULT_CATEGORIES,
  normalizeCategories,
  type Ledger,
  type Transaction,
} from "./money.ts";

const dataPath = resolve(process.env.KASA_DATA ?? ".data/kasa.json");

let cache: Ledger | null = null;
let writeChain: Promise<void> = Promise.resolve();

function emptyLedger(): Ledger {
  return {
    categories: structuredClone(DEFAULT_CATEGORIES),
    transactions: [],
    rate: null,
    settings: { theme: "system" },
    account: null,
  };
}

function readDisk(): Ledger {
  try {
    const parsed = JSON.parse(readFileSync(dataPath, "utf8")) as Partial<Ledger> & {
      categories?: unknown;
    };
    const theme = parsed.settings?.theme;
    return {
      categories: normalizeCategories(parsed.categories),
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      rate: parsed.rate ?? null,
      settings: {
        theme: theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
      },
      account: parseAccount(parsed.account),
    };
  } catch {
    return emptyLedger();
  }
}

function persist(next: Ledger) {
  mkdirSync(dirname(dataPath), { recursive: true });
  const tempPath = `${dataPath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, dataPath);
  try {
    chmodSync(dataPath, 0o600);
  } catch {}
}

export function getLedger(): Ledger {
  if (!cache) cache = readDisk();
  return cache;
}

export function saveLedger(mutator: (current: Ledger) => Ledger): Ledger {
  const next = mutator(structuredClone(getLedger()));
  cache = next;
  writeChain = writeChain.then(() => persist(next)).catch((error) => {
    console.error("kasa persist failed", error);
  });
  return next;
}

export async function flushLedger() {
  await writeChain;
}

export function sortTransactions(items: Transaction[]): Transaction[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}
