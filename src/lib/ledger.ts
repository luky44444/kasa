import { EXAMPLE_TRANSACTIONS } from "./example.ts";
import { fetchCnbEurRate, isRateStale } from "./cnb.ts";
import { getLedger, saveLedger, sortTransactions } from "./store.ts";
import {
  guessIcon,
  slugId,
  type PublicLedger,
  type RateQuote,
  type ThemePref,
  type Transaction,
} from "./money.ts";

export async function ensureRate(force = false): Promise<RateQuote> {
  const current = getLedger();
  if (!force && current.rate && !isRateStale(current.rate)) {
    return current.rate;
  }
  try {
    const quote = await fetchCnbEurRate();
    saveLedger((ledger) => ({ ...ledger, rate: quote }));
    return quote;
  } catch (error) {
    if (current.rate) return current.rate;
    throw error;
  }
}

export async function loadState(): Promise<PublicLedger> {
  let rate: RateQuote | null = null;
  try {
    rate = await ensureRate();
  } catch (error) {
    console.error("ČNB rate unavailable", error);
    rate = getLedger().rate;
  }
  const ledger = getLedger();
  return {
    categories: ledger.categories,
    transactions: sortTransactions(ledger.transactions),
    rate,
    settings: ledger.settings,
    me: ledger.account
      ? { email: ledger.account.email, hasPin: Boolean(ledger.account.pinHash) }
      : null,
  };
}

export function addTransaction(input: Omit<Transaction, "id" | "createdAt">): Ledger {
  return saveLedger((ledger) => {
    const categories = ledger.categories.some((item) => item.name === input.category)
      ? ledger.categories
      : [...ledger.categories, { id: slugId(input.category), name: input.category, icon: guessIcon(input.category) }];
    return {
      ...ledger,
      categories,
      transactions: [
        {
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
        ...ledger.transactions,
      ],
    };
  });
}

export function updateTransaction(id: string, input: Omit<Transaction, "id" | "createdAt">): Ledger {
  return saveLedger((ledger) => {
    const current = ledger.transactions.find((item) => item.id === id);
    if (!current) return ledger;
    const categories = ledger.categories.some((item) => item.name === input.category)
      ? ledger.categories
      : [...ledger.categories, { id: slugId(input.category), name: input.category, icon: guessIcon(input.category) }];
    return {
      ...ledger,
      categories,
      transactions: ledger.transactions.map((item) =>
        item.id === id ? { ...item, ...input } : item,
      ),
    };
  });
}

export function removeTransaction(id: string): Ledger {
  return saveLedger((ledger) => ({
    ...ledger,
    transactions: ledger.transactions.filter((item) => item.id !== id),
  }));
}

export function addCategory(name: string, icon?: string): Ledger {
  const trimmed = name.trim();
  if (!trimmed) return getLedger();
  return saveLedger((ledger) => {
    if (ledger.categories.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) {
      return ledger;
    }
    return {
      ...ledger,
      categories: [
        ...ledger.categories,
        { id: slugId(trimmed), name: trimmed, icon: icon || guessIcon(trimmed) },
      ],
    };
  });
}

export function updateCategory(id: string, patch: { name?: string; icon?: string }): Ledger {
  return saveLedger((ledger) => {
    const current = ledger.categories.find((item) => item.id === id);
    if (!current) return ledger;
    const nextName = patch.name?.trim() || current.name;
    const nextIcon = patch.icon || current.icon;
    return {
      ...ledger,
      categories: ledger.categories.map((item) =>
        item.id === id ? { ...item, name: nextName, icon: nextIcon } : item,
      ),
      transactions:
        nextName === current.name
          ? ledger.transactions
          : ledger.transactions.map((item) =>
              item.category === current.name ? { ...item, category: nextName } : item,
            ),
    };
  });
}

export function removeCategory(id: string): Ledger {
  return saveLedger((ledger) => {
    const current = ledger.categories.find((item) => item.id === id);
    if (!current) return ledger;
    const remaining = ledger.categories.filter((item) => item.id !== id);
    const fallback =
      remaining.find((item) => item.name === "Other") ??
      remaining[0] ?? { id: "other", name: "Other", icon: "other" };
    const categories = remaining.some((item) => item.id === fallback.id)
      ? remaining
      : [...remaining, fallback];
    return {
      ...ledger,
      categories,
      transactions: ledger.transactions.map((item) =>
        item.category === current.name ? { ...item, category: fallback.name } : item,
      ),
    };
  });
}

export function updateSettings(theme: ThemePref): Ledger {
  return saveLedger((ledger) => ({
    ...ledger,
    settings: { theme },
  }));
}

export function seedExample(): Ledger {
  return saveLedger((ledger) => {
    const existingIds = new Set(ledger.transactions.map((item) => item.id));
    const extra = EXAMPLE_TRANSACTIONS.filter((item) => !existingIds.has(item.id));
    const categories = [...ledger.categories];
    for (const item of extra) {
      if (!categories.some((row) => row.name === item.category)) {
        categories.push({
          id: slugId(item.category),
          name: item.category,
          icon: guessIcon(item.category),
        });
      }
    }
    return {
      ...ledger,
      categories,
      transactions: [...extra, ...ledger.transactions],
    };
  });
}
