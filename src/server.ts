import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import {
  isValidPassword,
  isValidSession,
  passwordEnabled,
  sessionCookieName,
  sessionToken,
} from "./lib/auth.ts";
import {
  addCategory,
  addTransaction,
  loadState,
  removeCategory,
  removeTransaction,
  seedExample,
  updateCategory,
  updateSettings,
  updateTransaction,
} from "./lib/ledger.ts";
import { flushLedger } from "./lib/store.ts";
import { parseAmountToMinor, type Currency, type Direction, type ThemePref } from "./lib/money.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const PUBLIC_DIR = join(import.meta.dirname, "../public");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res: import("node:http").ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "content-type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

function cookieHeader(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName()}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000${secure}`;
}

function readCookies(req: import("node:http").IncomingMessage) {
  const header = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = rest.join("=");
  }
  return out;
}

function authorized(req: import("node:http").IncomingMessage) {
  return isValidSession(readCookies(req)[sessionCookieName()]);
}

function parseTx(body: Record<string, unknown>) {
  const amount = parseAmountToMinor(String(body.amount ?? ""));
  const currency = String(body.currency ?? "CZK") as Currency;
  const direction = String(body.direction ?? "out") as Direction;
  const date = String(body.date ?? "");
  const category = String(body.category ?? "Other").trim() || "Other";
  const note = String(body.note ?? "").trim();
  if (!amount || amount <= 0) return { error: "Enter an amount" };
  if (currency !== "CZK" && currency !== "EUR") return { error: "Pick CZK or EUR" };
  if (direction !== "in" && direction !== "out") return { error: "Pick income or expense" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date" };
  return { value: { date, direction, currency, minor: amount, category, note } };
}

async function readBody(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function serveStatic(urlPath: string, res: import("node:http").ServerResponse) {
  const relative = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = normalize(join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(normalize(PUBLIC_DIR))) {
    send(res, 403, { error: "Forbidden" });
    return;
  }
  if (!existsSync(filePath)) {
    send(res, 404, { error: "Not found" });
    return;
  }
  const type = TYPES[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(readFileSync(filePath));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (path === "/login" || path === "/login.html") {
      serveStatic("/login.html", res);
      return;
    }

    if (path.startsWith("/api/")) {
      if (path === "/api/login" && method === "POST") {
        const body = await readBody(req);
        if (!isValidPassword(String(body.password ?? ""))) {
          send(res, 401, { error: "Wrong password" });
          return;
        }
        send(res, 200, { ok: true }, { "set-cookie": cookieHeader(sessionToken()) });
        return;
      }
      if (path === "/api/logout" && method === "POST") {
        send(res, 200, { ok: true }, { "set-cookie": `${sessionCookieName()}=; Path=/; Max-Age=0` });
        return;
      }
      if (!authorized(req)) {
        send(res, 401, { error: "Unauthorized" });
        return;
      }
      if (path === "/api/state" && method === "GET") {
        send(res, 200, await loadState());
        return;
      }
      if (path === "/api/transactions" && method === "POST") {
        const parsed = parseTx(await readBody(req));
        if ("error" in parsed) {
          send(res, 400, { error: parsed.error });
          return;
        }
        addTransaction(parsed.value);
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      if (path.startsWith("/api/transactions/") && method === "PUT") {
        const id = decodeURIComponent(path.slice("/api/transactions/".length));
        const parsed = parseTx(await readBody(req));
        if ("error" in parsed) {
          send(res, 400, { error: parsed.error });
          return;
        }
        updateTransaction(id, parsed.value);
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      if (path.startsWith("/api/transactions/") && method === "DELETE") {
        const id = decodeURIComponent(path.slice("/api/transactions/".length));
        removeTransaction(id);
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      if (path === "/api/categories" && method === "POST") {
        const body = await readBody(req);
        addCategory(String(body.name ?? ""), String(body.icon ?? ""));
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      if (path.startsWith("/api/categories/") && method === "PATCH") {
        const id = decodeURIComponent(path.slice("/api/categories/".length));
        const body = await readBody(req);
        updateCategory(id, {
          name: body.name == null ? undefined : String(body.name),
          icon: body.icon == null ? undefined : String(body.icon),
        });
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      if (path.startsWith("/api/categories/") && method === "DELETE") {
        const id = decodeURIComponent(path.slice("/api/categories/".length));
        removeCategory(id);
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      if (path === "/api/settings" && method === "PATCH") {
        const body = await readBody(req);
        const theme = String(body.theme ?? "") as ThemePref;
        if (theme !== "system" && theme !== "light" && theme !== "dark") {
          send(res, 400, { error: "Theme must be system, light, or dark" });
          return;
        }
        updateSettings(theme);
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      if (path === "/api/example" && method === "POST") {
        seedExample();
        await flushLedger();
        send(res, 200, await loadState());
        return;
      }
      send(res, 404, { error: "Not found" });
      return;
    }

    if (passwordEnabled() && !authorized(req) && path === "/") {
      res.writeHead(302, { location: "/login" });
      res.end();
      return;
    }

    serveStatic(path, res);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Kasa on http://${HOST}:${PORT}`);
});
