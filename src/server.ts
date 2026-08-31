import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import {
  allowAttempt,
  authStatus,
  clearSession,
  gateLocation,
  isUnlocked,
  isValidSession,
  lockPin,
  loginAccount,
  registerAccount,
  sessionCookieName,
  setPin,
  touchPin,
  unlockCookieName,
  unlockPin,
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

const OPEN_PATHS = new Set([
  "/login",
  "/login.html",
  "/register",
  "/pin",
  "/app.css",
  "/icon.svg",
  "/manifest.webmanifest",
]);

function send(res: import("node:http").ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "content-type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(payload);
}

function isHttps(req: import("node:http").IncomingMessage) {
  if (process.env.NODE_ENV === "production") return true;
  const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  return proto === "https";
}

function cookieFlags(req: import("node:http").IncomingMessage, maxAge?: number) {
  const secure = isHttps(req) ? "; Secure" : "";
  const age = maxAge == null ? "" : `; Max-Age=${maxAge}`;
  return `HttpOnly; SameSite=Lax; Path=/${age}${secure}`;
}

function sessionCookie(req: import("node:http").IncomingMessage, token: string) {
  return `${sessionCookieName()}=${token}; ${cookieFlags(req, 34560000)}`;
}

function unlockCookie(req: import("node:http").IncomingMessage, token: string) {
  return `${unlockCookieName()}=${token}; ${cookieFlags(req)}`;
}

function clearCookies(req: import("node:http").IncomingMessage) {
  const flags = cookieFlags(req, 0);
  return [`${sessionCookieName()}=; ${flags}`, `${unlockCookieName()}=; ${flags}`];
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

function cookiesOf(req: import("node:http").IncomingMessage) {
  const all = readCookies(req);
  return { session: all[sessionCookieName()], unlock: all[unlockCookieName()] };
}

function loggedIn(req: import("node:http").IncomingMessage) {
  return isValidSession(cookiesOf(req).session);
}

function unlocked(req: import("node:http").IncomingMessage) {
  const { session, unlock } = cookiesOf(req);
  return isUnlocked(session, unlock);
}

function clientIp(req: import("node:http").IncomingMessage) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
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
  res.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(readFileSync(filePath));
}

function redirect(res: import("node:http").ServerResponse, location: string) {
  res.writeHead(302, { location, "cache-control": "no-store" });
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    const method = req.method ?? "GET";
    const { session, unlock } = cookiesOf(req);
    const status = authStatus(session, unlock);

    if (path.startsWith("/api/")) {
      if (path === "/api/auth" && method === "GET") {
        send(res, 200, status);
        return;
      }
      if (path === "/api/register" && method === "POST") {
        if (!allowAttempt(clientIp(req))) {
          send(res, 429, { error: "Too many attempts. Wait and try again." });
          return;
        }
        const body = await readBody(req);
        const result = await registerAccount(String(body.email ?? ""), String(body.password ?? ""));
        await flushLedger();
        if ("error" in result) {
          send(res, result.status, { error: result.error });
          return;
        }
        send(res, 200, { ok: true, hasPin: result.hasPin }, { "set-cookie": sessionCookie(req, result.token) });
        return;
      }
      if (path === "/api/login" && method === "POST") {
        if (!allowAttempt(clientIp(req))) {
          send(res, 429, { error: "Too many attempts. Wait and try again." });
          return;
        }
        const body = await readBody(req);
        const result = await loginAccount(String(body.email ?? ""), String(body.password ?? ""));
        if ("error" in result) {
          send(res, result.status, { error: result.error });
          return;
        }
        send(res, 200, { ok: true, hasPin: result.hasPin }, { "set-cookie": sessionCookie(req, result.token) });
        return;
      }
      if (path === "/api/logout" && method === "POST") {
        clearSession();
        await flushLedger();
        send(res, 200, { ok: true }, { "set-cookie": clearCookies(req) });
        return;
      }
      if (path === "/api/lock" && method === "POST") {
        if (!loggedIn(req)) {
          send(res, 401, { error: "Unauthorized", ...status });
          return;
        }
        lockPin();
        await flushLedger();
        const flags = cookieFlags(req, 0);
        send(res, 200, { ok: true }, { "set-cookie": `${unlockCookieName()}=; ${flags}` });
        return;
      }
      if (path === "/api/pin" && method === "POST") {
        if (!loggedIn(req)) {
          send(res, 401, { error: "Unauthorized", ...status });
          return;
        }
        if (!allowAttempt(clientIp(req))) {
          send(res, 429, { error: "Too many attempts. Wait and try again." });
          return;
        }
        const body = await readBody(req);
        const result = await setPin(String(body.pin ?? ""));
        await flushLedger();
        if ("error" in result) {
          send(res, result.status, { error: result.error });
          return;
        }
        send(res, 200, { ok: true }, { "set-cookie": unlockCookie(req, result.unlock) });
        return;
      }
      if (path === "/api/unlock" && method === "POST") {
        if (!loggedIn(req)) {
          send(res, 401, { error: "Unauthorized", ...status });
          return;
        }
        if (!allowAttempt(clientIp(req))) {
          send(res, 429, { error: "Too many attempts. Wait and try again." });
          return;
        }
        const body = await readBody(req);
        const result = await unlockPin(String(body.pin ?? ""));
        await flushLedger();
        if ("error" in result) {
          send(res, result.status, { error: result.error });
          return;
        }
        send(res, 200, { ok: true }, { "set-cookie": unlockCookie(req, result.unlock) });
        return;
      }
      if (!loggedIn(req) || !unlocked(req)) {
        send(res, 401, { error: "Unauthorized", ...authStatus(session, unlock) });
        return;
      }
      touchPin();
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

    if (path === "/login" || path === "/login.html" || path === "/register" || path === "/pin") {
      const next = gateLocation(session, unlock);
      const here = path === "/pin" ? "/pin" : path === "/register" ? "/register" : "/login";
      if (next !== here) {
        redirect(res, next);
        return;
      }
      serveStatic("/login.html", res);
      return;
    }

    if (OPEN_PATHS.has(path) && !status.unlocked) {
      serveStatic(path === "/pin" ? "/login.html" : path, res);
      return;
    }

    if (!status.unlocked) {
      redirect(res, gateLocation(session, unlock));
      return;
    }

    serveStatic(path, res);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Kasa on http://${HOST}:${PORT}`);
});
