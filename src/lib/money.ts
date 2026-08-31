export type Currency = "CZK" | "EUR";
export type Direction = "in" | "out";
export type ThemePref = "system" | "light" | "dark";

export type Transaction = {
  id: string;
  date: string;
  direction: Direction;
  currency: Currency;
  minor: number;
  category: string;
  note: string;
  createdAt: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
};

export type Settings = {
  theme: ThemePref;
};

export type RateQuote = {
  eur: number;
  validFor: string;
  source: "CNB";
  fetchedAt: string;
  tlsRelaxed?: boolean;
};

export type Account = {
  email: string;
  passwordHash: string;
  salt: string;
  sessionSecret: string;
  createdAt: string;
  lastSeen: string;
};

const HEX32 = /^[0-9a-f]{32}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;

export function parseAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const passwordHash = String(row.passwordHash ?? "");
  const salt = String(row.salt ?? "");
  const sessionSecret = String(row.sessionSecret ?? "");
  if (!HEX64.test(passwordHash) || !HEX32.test(salt) || !HEX64.test(sessionSecret)) return null;
  return {
    email: String(row.email ?? "").trim().toLowerCase(),
    passwordHash: passwordHash.toLowerCase(),
    salt: salt.toLowerCase(),
    sessionSecret: sessionSecret.toLowerCase(),
    createdAt: String(row.createdAt ?? ""),
    lastSeen: String(row.lastSeen ?? ""),
  };
}

export type Ledger = {
  categories: Category[];
  transactions: Transaction[];
  rate: RateQuote | null;
  settings: Settings;
  account: Account | null;
};

export type PublicLedger = {
  categories: Category[];
  transactions: Transaction[];
  rate: RateQuote | null;
  settings: Settings;
  me: { locked: boolean } | null;
};

export const ICON_IDS = [
  "salary",
  "food",
  "transport",
  "stay",
  "games",
  "drinks",
  "cart",
  "home",
  "health",
  "gift",
  "plane",
  "fuel",
  "clothes",
  "bills",
  "phone",
  "pet",
  "work",
  "fun",
  "book",
  "other",
  "music",
  "film",
  "gym",
  "bike",
  "pizza",
  "baby",
  "school",
  "laptop",
  "wifi",
  "leaf",
  "tools",
  "camera",
  "map",
  "globe",
  "piggy",
  "users",
  "calendar",
  "mail",
  "tv",
  "headphones",
  "trophy",
  "ticket",
  "pills",
  "plant",
  "fish",
  "bus",
  "coffee",
  "parking",
  "bank",
  "chart",
  "heart",
  "star",
  "bolt",
  "umbrella",
  "mountain",
  "tent",
  "scissors",
  "soap",
  "key",
] as const;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "salary", name: "Salary", icon: "salary" },
  { id: "food", name: "Food", icon: "food" },
  { id: "transport", name: "Transport", icon: "transport" },
  { id: "stay", name: "Stay", icon: "stay" },
  { id: "games", name: "Games", icon: "games" },
  { id: "drinks", name: "Drinks", icon: "drinks" },
  { id: "other", name: "Other", icon: "other" },
];

const ICON_HINTS: Array<[string, string]> = [
  ["salary", "salary"],
  ["wage", "salary"],
  ["pay", "salary"],
  ["food", "food"],
  ["grocery", "food"],
  ["restaur", "food"],
  ["transport", "transport"],
  ["train", "transport"],
  ["bus", "transport"],
  ["taxi", "transport"],
  ["car", "transport"],
  ["stay", "stay"],
  ["hotel", "stay"],
  ["rent", "home"],
  ["home", "home"],
  ["game", "games"],
  ["steam", "games"],
  ["drink", "drinks"],
  ["coffee", "drinks"],
  ["beer", "drinks"],
  ["shop", "cart"],
  ["cart", "cart"],
  ["health", "health"],
  ["doctor", "health"],
  ["gift", "gift"],
  ["plane", "plane"],
  ["flight", "plane"],
  ["fuel", "fuel"],
  ["clothes", "clothes"],
  ["bill", "bills"],
  ["phone", "phone"],
  ["pet", "pet"],
  ["work", "work"],
  ["fun", "fun"],
  ["book", "book"],
  ["pizza", "pizza"],
  ["gym", "gym"],
  ["sport", "gym"],
  ["bike", "bike"],
  ["bus", "bus"],
  ["music", "music"],
  ["film", "film"],
  ["movie", "film"],
  ["baby", "baby"],
  ["child", "baby"],
  ["school", "school"],
  ["laptop", "laptop"],
  ["wifi", "wifi"],
  ["plant", "plant"],
  ["leaf", "leaf"],
  ["tool", "tools"],
  ["camera", "camera"],
  ["map", "map"],
  ["globe", "globe"],
  ["save", "piggy"],
  ["piggy", "piggy"],
  ["family", "users"],
  ["friend", "users"],
  ["calendar", "calendar"],
  ["mail", "mail"],
  ["tv", "tv"],
  ["headphone", "headphones"],
  ["trophy", "trophy"],
  ["ticket", "ticket"],
  ["pill", "pills"],
  ["fish", "fish"],
  ["park", "parking"],
  ["bank", "bank"],
  ["invest", "chart"],
  ["chart", "chart"],
  ["heart", "heart"],
  ["star", "star"],
  ["subscr", "star"],
  ["electric", "bolt"],
  ["bolt", "bolt"],
  ["insur", "umbrella"],
  ["umbrella", "umbrella"],
  ["mountain", "mountain"],
  ["camp", "tent"],
  ["tent", "tent"],
  ["hair", "scissors"],
  ["scissors", "scissors"],
  ["soap", "soap"],
  ["key", "key"],
  ["coffee", "coffee"],
];

export function guessIcon(name: string): string {
  const key = name.trim().toLowerCase();
  for (const [hint, icon] of ICON_HINTS) {
    if (key.includes(hint)) return icon;
  }
  return "other";
}

export function slugId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "category";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw) || raw.length === 0) return structuredClone(DEFAULT_CATEGORIES);
  const used = new Set<string>();
  const out: Category[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const name = item.trim();
      if (!name || used.has(name.toLowerCase())) continue;
      used.add(name.toLowerCase());
      out.push({ id: slugId(name), name, icon: guessIcon(name) });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; name?: unknown; icon?: unknown };
    const name = String(row.name ?? "").trim();
    if (!name || used.has(name.toLowerCase())) continue;
    used.add(name.toLowerCase());
    const icon = String(row.icon ?? guessIcon(name));
    out.push({
      id: String(row.id ?? slugId(name)),
      name,
      icon: ICON_IDS.includes(icon as (typeof ICON_IDS)[number]) ? icon : guessIcon(name),
    });
  }
  return out.length ? out : structuredClone(DEFAULT_CATEGORIES);
}

export function parseAmountToMinor(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function minorToNumber(minor: number): number {
  return minor / 100;
}

export function toCzkHaler(tx: Transaction, eurRate: number): number {
  const signed = tx.direction === "out" ? -tx.minor : tx.minor;
  if (tx.currency === "CZK") return signed;
  return Math.round(signed * eurRate);
}

export function formatCzk(haler: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(haler / 100);
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatRate(eur: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(eur);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function currentMonthKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [yearText, monthText] = key.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(key: string): string {
  const [yearText, monthText] = key.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1, 1);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
}

export function newId(): string {
  return crypto.randomUUID();
}
