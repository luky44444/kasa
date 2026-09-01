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

type SupabaseConfig = { url: string; key: string; storeSecret: string };

function supabaseConfig(): SupabaseConfig | null {
  const url = String(process.env.SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
  ).trim();
  const storeSecret = String(process.env.KASA_STORE_SECRET ?? "").trim();
  if (!url || !key) return null;
  return { url, key, storeSecret };
}

function supabaseHeaders(key: string) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

let cache: Ledger | null = null;
let hydrated = false;
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

function ledgerHasData(ledger: Ledger | null) {
  return Boolean(ledger && (ledger.account || ledger.transactions.length > 0));
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

function persistFile(next: Ledger) {
  const path = dataFile();
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {}
}

async function readSupabase(config: SupabaseConfig): Promise<Ledger | null> {
  const raw = config.storeSecret
    ? await readSupabaseRpc(config)
    : await readSupabaseTable(config);
  if (!raw || typeof raw !== "object") return null;
  return ledgerFromParsed(raw as Partial<Ledger> & { categories?: unknown });
}

async function readSupabaseTable(config: SupabaseConfig) {
  const response = await fetch(`${config.url}/rest/v1/kasa_ledger?id=eq.1&select=data`, {
    headers: supabaseHeaders(config.key),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase read failed (${response.status}) ${detail}`.trim());
  }
  const rows = (await response.json()) as Array<{ data?: unknown }>;
  return rows[0]?.data ?? null;
}

async function readSupabaseRpc(config: SupabaseConfig) {
  const response = await fetch(`${config.url}/rest/v1/rpc/kasa_load`, {
    method: "POST",
    headers: supabaseHeaders(config.key),
    body: JSON.stringify({ secret: config.storeSecret }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase read failed (${response.status}) ${detail}`.trim());
  }
  return response.json();
}

async function writeSupabase(config: SupabaseConfig, ledger: Ledger) {
  if (config.storeSecret) {
    const response = await fetch(`${config.url}/rest/v1/rpc/kasa_save`, {
      method: "POST",
      headers: supabaseHeaders(config.key),
      body: JSON.stringify({ secret: config.storeSecret, ledger }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Supabase write failed (${response.status}) ${detail}`.trim());
    }
    return;
  }
  const response = await fetch(`${config.url}/rest/v1/kasa_ledger?on_conflict=id`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config.key),
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ id: 1, data: ledger, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase write failed (${response.status}) ${detail}`.trim());
  }
}

function loadFromDisk(): Ledger {
  let ledger = readDisk();
  if (ledger.transactions.length === 0) {
    const disk = readDiskIfPresent();
    if (disk && disk.transactions.length > 0) ledger = mergeLedgers(disk, ledger);
  }
  if (ledger.transactions.length === 0) {
    const bak = readBackup();
    if (bak && bak.transactions.length > 0) {
      ledger = mergeLedgers(bak, ledger);
      const snapshot = ledger;
      writeChain = writeChain.then(() => persist(snapshot)).catch((error) => {
        console.error("kasa persist failed", error);
      });
    }
  }
  return ledger;
}

async function persist(next: Ledger) {
  const remote = supabaseConfig();
  if (remote) {
    if (!hydrated) return;
    await writeSupabase(remote, next);
    try {
      persistFile(next);
    } catch (error) {
      console.error("kasa file persist failed", error);
    }
    return;
  }
  persistFile(next);
}

export function ledgerStoreName() {
  return supabaseConfig() ? "supabase" : `file ${dataFile()}`;
}

export function getLedger(): Ledger {
  if (!cache) {
    cache = supabaseConfig() ? emptyLedger() : loadFromDisk();
    if (!supabaseConfig()) hydrated = true;
  }
  return cache;
}

export async function reloadLedger(): Promise<Ledger> {
  cache = null;
  hydrated = false;
  const remote = supabaseConfig();
  if (remote) {
    try {
      const cloud = await readSupabase(remote);
      const disk = readDiskIfPresent() ?? readBackup();
      if (ledgerHasData(cloud)) {
        cache = cloud;
      } else if (ledgerHasData(disk)) {
        cache = disk;
        await writeSupabase(remote, disk);
      } else {
        cache = cloud ?? emptyLedger();
      }
    } catch (error) {
      console.error("kasa supabase hydrate failed", error);
      cache = loadFromDisk();
    }
    hydrated = true;
    return cache;
  }
  cache = loadFromDisk();
  hydrated = true;
  return cache;
}

export function saveLedger(mutator: (current: Ledger) => Ledger): Ledger {
  const next = mutator(structuredClone(getLedger()));
  let merged = next;
  if (!supabaseConfig()) {
    const disk = readDiskIfPresent();
    merged = disk ? mergeLedgers(disk, next) : next;
    if (disk && disk.transactions.length > 0 && next.transactions.length === 0) {
      try {
        const path = dataFile();
        copyFileSync(path, `${path}.bak`);
      } catch {}
    }
  }
  cache = merged;
  const snapshot = merged;
  writeChain = writeChain.then(() => persist(snapshot)).catch((error) => {
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
