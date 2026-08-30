import { get } from "node:https";
import type { RateQuote } from "./money.ts";

const CNB_TXT =
  "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt";

const STALE_MS = 3 * 60 * 60 * 1000;

export function isRateStale(rate: RateQuote | null, now = Date.now()): boolean {
  if (!rate) return true;
  return now - Date.parse(rate.fetchedAt) > STALE_MS;
}

function isCertError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: { code?: unknown } }).cause
      : undefined;
  const causeCode = cause && typeof cause === "object" ? String(cause.code ?? "") : "";
  return code.includes("UNABLE_TO_VERIFY") || causeCode.includes("UNABLE_TO_VERIFY");
}

function download(insecure: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(
      CNB_TXT,
      {
        rejectUnauthorized: !insecure,
        headers: { Accept: "text/plain" },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`ČNB request failed (${response.statusCode})`));
          response.resume();
          return;
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk as Buffer));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("error", reject);
  });
}

export async function fetchCnbEurRate(): Promise<RateQuote> {
  try {
    const body = await download(false);
    return parseCnbTxt(body);
  } catch (error) {
    if (!isCertError(error)) throw error;
    console.warn("ČNB certificate verify failed; retrying once (common with Windows HTTPS scanning).");
    const body = await download(true);
    return { ...parseCnbTxt(body), tlsRelaxed: true };
  }
}

export function parseCnbTxt(body: string): RateQuote {
  const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0] ?? "";
  const dateMatch = header.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!dateMatch) {
    throw new Error("ČNB header has no date");
  }
  const validFor = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

  const eurLine = lines.find((line) => {
    const parts = line.split("|");
    return parts[3] === "EUR";
  });
  if (!eurLine) {
    throw new Error("ČNB feed has no EUR row");
  }

  const parts = eurLine.split("|");
  const amount = Number((parts[2] ?? "1").replace(",", "."));
  const rawRate = Number((parts[4] ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rawRate)) {
    throw new Error("ČNB EUR rate is not a number");
  }

  return {
    eur: rawRate / amount,
    validFor,
    source: "CNB",
    fetchedAt: new Date().toISOString(),
  };
}
