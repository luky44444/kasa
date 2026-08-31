import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  parseAccount,
  DEFAULT_CATEGORIES,
  normalizeCategories,
  type Ledger,
  type Transaction,
} from "./money.ts";

function dataFile() {
  return resolve(process.env.KASA_DATA ?? ".data/kasa.json");
}

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

function ledgerFromParsed(parsed: Partial<Ledger> & { categories?: unknown }): Ledger {
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
}

function readDisk(): Ledger {
  try {
    return ledgerFromParsed(JSON.parse(readFileSync(dataFile(), "utf8")) as Partial<Ledger> & { categories?: unknown });
  } catch {
    return emptyLedger();
  }
}

function readDiskIfPresent(): Ledger | null {
  const path = dataFile();
  if (!existsSync(path)) return null;
  try {
    return ledgerFromParsed(JSON.parse(readFileSync(path, "utf8")) as Partial<Ledger> & { categories?: unknown });
  } catch {
    return null;
  }
}

function readBackup(): Ledger | null {
  const path = `${dataFile()}.bak`;
  if (!existsSync(path)) return null;
  try {
    return ledgerFromParsed(JSON.parse(readFileSync(path, "utf8")) as Partial<Ledger> & { categories?: unknown });
  } catch {
    return null;
  }
}

export function mergeLedgers(disk: Ledger, next: Ledger): Ledger {
  const tx = new Map<string, Transaction>();
  for (const item of disk.transactions) tx.set(item.id, item);
  for (const item of next.transactions) tx.set(item.id, item);
  const categories = new Map<string, Ledger["categories"][number]>();
  for (const item of disk.categories) categories.set(item.id, item);
  for (const item of next.categories) categories.set(item.id, item);
  return {
    categories: categories.size ? [...categories.values()] : next.categories,
    transactions: [...tx.values()],
    rate: next.rate ?? disk.rate,
    settings: next.settings ?? disk.settings,
    account: next.account ?? disk.account,
  };
}

function persist(next: Ledger) {
  const path = dataFile();
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {}
}

export function getLedger(): Ledger {
  if (!cache) cache = readDisk();
  if (cache.transactions.length === 0) {
    const disk = readDiskIfPresent();
    if (disk && disk.transactions.length > 0) {
      cache = mergeLedgers(disk, cache);
    }
  }
  if (cache.transactions.length === 0) {
    const bak = readBackup();
    if (bak && bak.transactions.length > 0) {
      cache = mergeLedgers(bak, cache);
      const snapshot = cache;
      writeChain = writeChain.then(() => persist(snapshot)).catch((error) => {
        console.error("kasa persist failed", error);
      });
    }
  }
  return cache;
}

export function reloadLedger(): Ledger {
  cache = null;
  return getLedger();
}

export function saveLedger(mutator: (current: Ledger) => Ledger): Ledger {
  const next = mutator(structuredClone(getLedger()));
  const disk = readDiskIfPresent();
  const merged = disk ? mergeLedgers(disk, next) : next;
  if (disk && disk.transactions.length > 0 && next.transactions.length === 0) {
    try {
      const path = dataFile();
      copyFileSync(path, `${path}.bak`);
    } catch {}
  }
  cache = merged;
  writeChain = writeChain.then(() => persist(merged)).catch((error) => {
    console.error("kasa persist failed", error);
  });
  return merged;
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
