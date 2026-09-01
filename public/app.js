const state = {
  ledger: { categories: [], transactions: [], rate: null, settings: { theme: "system" }, me: null },
  month: currentMonthKey(),
  category: "Other",
  editingId: null,
  newIcon: null,
  iconTarget: null,
};

const els = {
  rateBox: document.getElementById("rateBox"),
  net: document.getElementById("net"),
  monthLabel: document.getElementById("monthLabel"),
  income: document.getElementById("income"),
  spend: document.getElementById("spend"),
  list: document.getElementById("list"),
  composer: document.getElementById("composer"),
  composerTitle: document.getElementById("composerTitle"),
  form: document.getElementById("addForm"),
  formError: document.getElementById("formError"),
  direction: document.getElementById("direction"),
  currency: document.getElementById("currency"),
  amount: document.getElementById("amount"),
  date: document.getElementById("date"),
  category: document.getElementById("category"),
  chips: document.getElementById("chips"),
  newCategory: document.getElementById("newCategory"),
  newIconBtn: document.getElementById("newIconBtn"),
  note: document.getElementById("note"),
  eurHint: document.getElementById("eurHint"),
  save: document.getElementById("save"),
  deleteTx: document.getElementById("deleteTx"),
  settings: document.getElementById("settings"),
  categoryList: document.getElementById("categoryList"),
  accountEmail: document.getElementById("accountEmail"),
  pinSetup: document.getElementById("pinSetup"),
  pinError: document.getElementById("pinError"),
  lockNow: document.getElementById("lockNow"),
  iconPicker: document.getElementById("iconPicker"),
  iconGrid: document.getElementById("iconGrid"),
  themeColor: document.getElementById("themeColor"),
  analytics: document.getElementById("analytics"),
  vsLast: document.getElementById("vsLast"),
  vsLastHint: document.getElementById("vsLastHint"),
  saveRate: document.getElementById("saveRate"),
  saveRateHint: document.getElementById("saveRateHint"),
  pace: document.getElementById("pace"),
  paceHint: document.getElementById("paceHint"),
  biggest: document.getElementById("biggest"),
  biggestHint: document.getElementById("biggestHint"),
  cashflowChart: document.getElementById("cashflowChart"),
  catChart: document.getElementById("catChart"),
  trendChart: document.getElementById("trendChart"),
  weekdayChart: document.getElementById("weekdayChart"),
  facts: document.getElementById("facts"),
};

function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftMonth(key, delta) {
  const [yearText, monthText] = key.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(key) {
  const [yearText, monthText] = key.split("-");
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    new Date(Number(yearText), Number(monthText) - 1, 1),
  );
}

function formatDay(date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00`),
  );
}

function formatCzk(haler) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(haler / 100);
}

function formatEur(cents) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatRate(eur) {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(eur);
}

function toCzkHaler(tx, eurRate) {
  const signed = tx.direction === "out" ? -tx.minor : tx.minor;
  if (tx.currency === "CZK") return signed;
  return Math.round(signed * eurRate);
}

function daysInMonth(key) {
  const [yearText, monthText] = key.split("-");
  return new Date(Number(yearText), Number(monthText), 0).getDate();
}

function monthTotals(key, rate) {
  const rows = state.ledger.transactions.filter((item) => item.date.slice(0, 7) === key);
  const income = rows.reduce((sum, item) => sum + Math.max(0, toCzkHaler(item, rate)), 0);
  const spend = rows.reduce((sum, item) => sum + Math.min(0, toCzkHaler(item, rate)), 0);
  return { rows, income, spend, net: income + spend };
}

function pctChange(current, previous) {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

function formatPct(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1000) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

function shortMonth(key) {
  const [yearText, monthText] = key.split("-");
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(
    new Date(Number(yearText), Number(monthText) - 1, 1),
  );
}

function setInsight(el, hintEl, value, hint) {
  if (el) el.textContent = value;
  if (hintEl) hintEl.textContent = hint || "";
}

function svgBars(series, { colors, labels, dual }) {
  const width = 640;
  const height = 200;
  const left = 8;
  const right = 8;
  const top = 12;
  const bottom = 28;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const max = Math.max(1, ...series.flatMap((row) => (dual ? [row.a, row.b] : [row.a])));
  const n = Math.max(1, series.length);
  const slot = innerW / n;
  const bar = Math.max(2, slot * (dual ? 0.32 : 0.55));
  const parts = [];
  series.forEach((row, index) => {
    const x = left + slot * index + slot / 2;
    if (dual) {
      const hIn = (row.a / max) * (innerH * 0.92);
      const hOut = (row.b / max) * (innerH * 0.92);
      parts.push(
        `<rect x="${(x - bar - 2).toFixed(1)}" y="${(top + innerH - hIn).toFixed(1)}" width="${bar.toFixed(1)}" height="${hIn.toFixed(1)}" rx="2" fill="${colors[0]}" />`,
      );
      parts.push(
        `<rect x="${(x + 2).toFixed(1)}" y="${(top + innerH - hOut).toFixed(1)}" width="${bar.toFixed(1)}" height="${hOut.toFixed(1)}" rx="2" fill="${colors[1]}" />`,
      );
    } else {
      const h = (row.a / max) * (innerH * 0.92);
      parts.push(
        `<rect x="${(x - bar / 2).toFixed(1)}" y="${(top + innerH - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${colors[0]}" />`,
      );
    }
    if (labels && (n <= 12 || index === 0 || index === n - 1 || (index + 1) % 5 === 0)) {
      parts.push(
        `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="currentColor" font-size="11">${labels[index]}</text>`,
      );
    }
  });
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${parts.join("")}</svg>`;
}

function svgHBars(rows) {
  if (!rows.length) return `<p class="chart-empty">No spend in this month.</p>`;
  const width = 640;
  const rowH = 34;
  const height = Math.max(80, rows.length * rowH + 8);
  const max = Math.max(1, ...rows.map((row) => row.value));
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${rows
    .map((row, index) => {
      const y = 8 + index * rowH;
      const w = Math.max(6, Math.min(400, (row.value / max) * 400));
      return `<text x="0" y="${y + 14}" fill="currentColor" font-size="13">${row.label}</text>
        <rect x="168" y="${y}" width="${w.toFixed(1)}" height="18" rx="4" fill="var(--spend)" />
        <text x="${(180 + w).toFixed(1)}" y="${y + 14}" fill="currentColor" font-size="12">${row.share}</text>`;
    })
    .join("")}</svg>`;
}

function renderAnalytics(monthRows, rate) {
  if (!els.analytics) return;
  const spendAbs = Math.abs(monthRows.reduce((sum, item) => sum + Math.min(0, toCzkHaler(item, rate)), 0));
  const income = monthRows.reduce((sum, item) => sum + Math.max(0, toCzkHaler(item, rate)), 0);
  const prev = monthTotals(shiftMonth(state.month, -1), rate);
  const prevSpend = Math.abs(prev.spend);
  const spendDelta = pctChange(spendAbs, prevSpend);
  setInsight(
    els.vsLast,
    els.vsLastHint,
    formatPct(spendDelta),
    prevSpend ? `Last month ${formatCzk(prevSpend)}` : "No spend last month",
  );
  if (els.vsLast) els.vsLast.classList.toggle("is-up", Boolean(spendDelta && spendDelta > 0));
  if (els.vsLast) els.vsLast.classList.toggle("is-down", Boolean(spendDelta && spendDelta < 0));

  const kept = income > 0 ? (income - spendAbs) / income : null;
  setInsight(
    els.saveRate,
    els.saveRateHint,
    kept == null ? "—" : formatPct(kept),
    income ? `${formatCzk(income - spendAbs)} left after spend` : "No income this month",
  );
  if (els.saveRate) {
    els.saveRate.classList.toggle("is-up", kept != null && kept < 0);
    els.saveRate.classList.toggle("is-down", kept != null && kept > 0);
  }

  const today = todayIso();
  const inViewMonth = today.slice(0, 7) === state.month;
  const elapsed = inViewMonth ? Number(today.slice(8, 10)) : daysInMonth(state.month);
  const daily = elapsed ? spendAbs / elapsed : 0;
  const projected = daily * daysInMonth(state.month);
  setInsight(
    els.pace,
    els.paceHint,
    spendAbs ? formatCzk(projected) : "—",
    spendAbs ? `${formatCzk(daily)} per day so far` : "No spend yet",
  );

  let biggest = null;
  for (const item of monthRows) {
    if (item.direction !== "out") continue;
    const czk = Math.abs(toCzkHaler(item, rate));
    if (!biggest || czk > biggest.czk) biggest = { item, czk };
  }
  setInsight(
    els.biggest,
    els.biggestHint,
    biggest ? formatCzk(biggest.czk) : "—",
    biggest ? `${biggest.item.note || biggest.item.category} · ${formatDay(biggest.item.date)}` : "No spend yet",
  );

  const dayCount = daysInMonth(state.month);
  const byDay = Array.from({ length: dayCount }, (_, i) => ({ a: 0, b: 0 }));
  for (const item of monthRows) {
    const day = Number(item.date.slice(8, 10)) - 1;
    if (day < 0 || day >= dayCount) continue;
    const czk = toCzkHaler(item, rate);
    if (czk > 0) byDay[day].a += czk;
    else byDay[day].b += Math.abs(czk);
  }
  const dayLabels = byDay.map((_, i) => (i === 0 || i === dayCount - 1 || (i + 1) % 5 === 0 ? String(i + 1) : ""));
  if (els.cashflowChart) {
    els.cashflowChart.innerHTML = monthRows.length
      ? `${svgBars(byDay, { colors: ["var(--income)", "var(--spend)"], labels: dayLabels, dual: true })}<p class="chart-legend"><span class="dot in"></span>Income <span class="dot out"></span>Spend</p>`
      : `<p class="chart-empty">Nothing to plot in ${escapeHtml(formatMonthLabel(state.month))}.</p>`;
  }

  const catMap = new Map();
  for (const item of monthRows) {
    if (item.direction !== "out") continue;
    const czk = Math.abs(toCzkHaler(item, rate));
    catMap.set(item.category, (catMap.get(item.category) || 0) + czk);
  }
  const catRows = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, value]) => ({
      label: escapeHtml(name),
      value,
      share: spendAbs ? `${Math.round((value / spendAbs) * 100)}%` : "0%",
    }));
  if (els.catChart) els.catChart.innerHTML = svgHBars(catRows);

  const keys = [];
  for (let i = 5; i >= 0; i -= 1) keys.push(shiftMonth(state.month, -i));
  const trend = keys.map((key) => {
    const totals = monthTotals(key, rate);
    return { a: Math.abs(totals.spend), b: totals.income };
  });
  if (els.trendChart) {
    els.trendChart.innerHTML = `${svgBars(trend, {
      colors: ["var(--spend)", "var(--income)"],
      labels: keys.map(shortMonth),
      dual: true,
    })}<p class="chart-legend"><span class="dot out"></span>Spend <span class="dot in"></span>Income</p>`;
  }

  const weekdays = [
    { key: 1, label: "Mon", a: 0 },
    { key: 2, label: "Tue", a: 0 },
    { key: 3, label: "Wed", a: 0 },
    { key: 4, label: "Thu", a: 0 },
    { key: 5, label: "Fri", a: 0 },
    { key: 6, label: "Sat", a: 0 },
    { key: 0, label: "Sun", a: 0 },
  ];
  for (const item of monthRows) {
    if (item.direction !== "out") continue;
    const dow = new Date(`${item.date}T12:00:00`).getDay();
    const row = weekdays.find((entry) => entry.key === dow);
    if (row) row.a += Math.abs(toCzkHaler(item, rate));
  }
  if (els.weekdayChart) {
    els.weekdayChart.innerHTML = svgBars(weekdays, {
      colors: ["var(--spend)"],
      labels: weekdays.map((row) => row.label),
      dual: false,
    });
  }

  const count = monthRows.length;
  const avgTicket = count && spendAbs ? spendAbs / monthRows.filter((item) => item.direction === "out").length : 0;
  const eurSpend = monthRows.reduce((sum, item) => {
    if (item.direction !== "out" || item.currency !== "EUR") return sum;
    return sum + Math.abs(toCzkHaler(item, rate));
  }, 0);
  const allNet = state.ledger.transactions.reduce((sum, item) => sum + toCzkHaler(item, rate), 0);
  const outCount = monthRows.filter((item) => item.direction === "out").length;
  const hot = weekdays.slice().sort((a, b) => b.a - a.a)[0];
  const facts = [
    `${count} row${count === 1 ? "" : "s"} this month`,
    outCount ? `Average spend ${formatCzk(avgTicket)}` : "No spend rows yet",
    spendAbs ? `${Math.round((eurSpend / spendAbs) * 100)}% of spend started in €` : "No euro spend mix yet",
    hot && hot.a ? `${hot.label} is the heaviest spend day` : "No weekday pattern yet",
    `All-time net ${formatCzk(allNet)}`,
  ];
  if (els.facts) {
    els.facts.innerHTML = facts.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  }
}

function parseAmountToHaler(raw, eurRate, currency) {
  const normalized = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const minor = Math.round(value * 100);
  if (currency === "CZK") return minor;
  return Math.round(minor * eurRate);
}

function categoryByName(name) {
  return state.ledger.categories.find((item) => item.name === name);
}

function resolvedTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(pref) {
  const theme = resolvedTheme(pref);
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("kasa-theme", pref);
  } catch {}
  if (els.themeColor) els.themeColor.content = theme === "dark" ? "#12110f" : "#f3efe6";
  document.querySelectorAll(".theme-btn").forEach((button) => {
    button.classList.toggle("on", button.dataset.theme === pref);
  });
}

const IDLE_MS = 5 * 60 * 1000;
let idleTimer = 0;
let lastActive = Date.now();

function stopIdleWatch() {
  clearTimeout(idleTimer);
  idleTimer = 0;
}

function startIdleWatch() {
  if (!state.ledger.me?.hasPin) {
    stopIdleWatch();
    return;
  }
  lastActive = Date.now();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (Date.now() - lastActive >= IDLE_MS - 50) lockNow();
  }, IDLE_MS);
}

function noteActivity() {
  lastActive = Date.now();
  startIdleWatch();
}

async function lockNow() {
  if (!state.ledger.me?.hasPin) return;
  stopIdleWatch();
  try {
    await fetch("/api/lock", { method: "POST" });
  } catch {}
  location.href = "/pin";
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    if (data.loggedIn === false || data.registered === false) {
      location.href = data.registered === false ? "/register" : "/login";
    } else {
      location.href = "/pin";
    }
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function apply(ledger) {
  state.ledger = ledger;
  if (!ledger.categories.some((item) => item.name === state.category)) {
    state.category = ledger.categories[0]?.name || "Other";
  }
  applyTheme(ledger.settings?.theme || "system");
  startIdleWatch();
  render();
  renderComposer();
  renderSettings();
}

function render() {
  const rate = state.ledger.rate?.eur ?? 0;
  const quote = state.ledger.rate;
  els.rateBox.innerHTML = quote
    ? `<b>1 € = ${formatRate(quote.eur)} Kč</b>ČNB ${quote.validFor.split("-").reverse().join(". ")}`
    : "ČNB unavailable";

  const rows = state.ledger.transactions.filter((item) => item.date.slice(0, 7) === state.month);
  const { income, spend, net } = monthTotals(state.month, rate);

  els.monthLabel.textContent = formatMonthLabel(state.month);
  els.net.textContent = formatCzk(net);
  els.net.classList.toggle("is-neg", net < 0);
  els.income.textContent = formatCzk(income);
  els.spend.textContent = formatCzk(Math.abs(spend));
  renderAnalytics(rows, rate);

  if (rows.length === 0) {
    els.list.innerHTML = `<div class="empty"><p>Nothing in ${formatMonthLabel(state.month)} yet.</p><button type="button" id="loadExample">Load August sample</button></div>`;
    document.getElementById("loadExample")?.addEventListener("click", async () => {
      apply(await api("/api/example", { method: "POST" }));
      state.month = "2026-08";
      render();
    });
    return;
  }

  const groups = new Map();
  for (const item of rows) {
    if (!groups.has(item.date)) groups.set(item.date, []);
    groups.get(item.date).push(item);
  }

  els.list.innerHTML = [...groups.entries()]
    .map(([date, items]) => {
      const lines = items
        .map((item) => {
          const czk = toCzkHaler(item, rate);
          const signed = formatCzk(czk);
          const cat = categoryByName(item.category);
          const eur =
            item.currency === "EUR"
              ? formatEur(item.direction === "out" ? -item.minor : item.minor)
              : "";
          return `<button class="item" data-id="${item.id}" type="button">
            <span class="glyph">${kasaIcon(cat?.icon || kasaGuessIcon(item.category))}</span>
            <span>
              <span class="name">${escapeHtml(item.note || item.category)}</span>
              <span class="meta">${escapeHtml(item.category)}${eur ? ` · ${eur}` : ""}</span>
            </span>
            <span class="sum ${item.direction}">
              ${item.direction === "out" ? signed : `+${signed.replace("−", "")}`}
            </span>
          </button>`;
        })
        .join("");
      return `<section class="day"><time>${formatDay(date)}</time>${lines}</section>`;
    })
    .join("");

  els.list.querySelectorAll(".item").forEach((button) => {
    button.addEventListener("click", () => {
      const row = state.ledger.transactions.find((item) => item.id === button.dataset.id);
      if (row) openComposer(row.direction, row);
    });
  });
}

function renderComposer() {
  const currency = els.currency.value;
  const direction = els.direction.value;
  const editing = Boolean(state.editingId);
  els.composer.classList.toggle("is-out", direction === "out");
  els.composer.classList.toggle("is-in", direction === "in");
  els.composerTitle.textContent = editing
    ? direction === "out"
      ? "Edit spend"
      : "Edit income"
    : direction === "out"
      ? "Spend"
      : "Income";
  els.save.textContent = editing ? "Save changes" : direction === "out" ? "Save spend" : "Save income";
  els.deleteTx.classList.toggle("hidden", !editing);
  els.category.value = state.category;

  document.querySelectorAll(".cur").forEach((button) => {
    button.classList.toggle("on", button.dataset.value === currency);
  });

  els.chips.innerHTML = state.ledger.categories
    .map(
      (cat) =>
        `<button type="button" class="${cat.name === state.category ? "on" : ""}" data-name="${escapeHtml(cat.name)}">${kasaIcon(cat.icon)} ${escapeHtml(cat.name)}</button>`,
    )
    .join("");
  els.chips.querySelectorAll("button").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.category = chip.dataset.name;
      renderComposer();
    });
  });

  const live = Number(String(els.amount.value).replace(",", "."));
  if (currency === "EUR" && state.ledger.rate && Number.isFinite(live) && live > 0) {
    const czk = parseAmountToHaler(els.amount.value, state.ledger.rate.eur, "EUR");
    els.eurHint.hidden = false;
    els.eurHint.textContent = `Counts as ${formatCzk(direction === "out" ? -czk : czk)} at ČNB`;
  } else {
    els.eurHint.hidden = true;
  }
}

function renderNewIconButton() {
  const picked = Boolean(state.newIcon);
  els.newIconBtn.classList.toggle("is-chooser", !picked);
  els.newIconBtn.innerHTML = kasaIcon(picked ? state.newIcon : "chooser");
}

function renderSettings() {
  renderNewIconButton();
  const hasPin = Boolean(state.ledger.me?.hasPin);
  if (els.accountEmail) {
    const email = state.ledger.me?.email || "";
    els.accountEmail.textContent = hasPin
      ? `${email} · PIN locks after 5 minutes idle`
      : email
        ? `${email} · signed in`
        : "Signed in";
  }
  if (els.pinSetup) els.pinSetup.hidden = hasPin;
  if (els.lockNow) els.lockNow.hidden = !hasPin;
  if (els.pinError) els.pinError.classList.add("hidden");
  els.categoryList.innerHTML = state.ledger.categories
    .map(
      (cat) => `<div class="cat-row" data-id="${cat.id}">
        <button class="icon-pick" type="button" data-icon-for="${cat.id}" aria-label="Change icon">${kasaIcon(cat.icon)}</button>
        <input value="${escapeHtml(cat.name)}" data-rename="${cat.id}" />
        <button class="kill" type="button" data-delete="${cat.id}">Delete</button>
      </div>`,
    )
    .join("");

  els.categoryList.querySelectorAll("[data-icon-for]").forEach((button) => {
    button.addEventListener("click", () => openIconPicker({ type: "cat", id: button.dataset.iconFor }));
  });
  els.categoryList.querySelectorAll("[data-rename]").forEach((input) => {
    input.addEventListener("change", async () => {
      const name = input.value.trim();
      if (!name) return;
      apply(
        await api(`/api/categories/${input.dataset.rename}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      );
    });
  });
  els.categoryList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.ledger.categories.length < 2) return;
      apply(await api(`/api/categories/${button.dataset.delete}`, { method: "DELETE" }));
    });
  });
}

function renderIconGrid() {
  els.iconGrid.innerHTML = KASA_ICON_IDS.map(
    (id) => `<button type="button" data-icon="${id}">${kasaIcon(id)}</button>`,
  ).join("");
  els.iconGrid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      const icon = button.dataset.icon;
      if (state.iconTarget?.type === "new") {
        state.newIcon = icon;
        renderNewIconButton();
      } else if (state.iconTarget?.type === "cat") {
        apply(
          await api(`/api/categories/${state.iconTarget.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ icon }),
          }),
        );
      }
      els.iconPicker.hidden = true;
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openComposer(direction, row) {
  state.editingId = row?.id ?? null;
  els.direction.value = direction;
  els.currency.value = row?.currency ?? "CZK";
  els.date.value = row?.date ?? todayIso();
  els.amount.value = row ? String(row.minor / 100).replace(".", ",") : "";
  els.note.value = row?.note ?? "";
  state.category = row?.category ?? state.category;
  els.formError.classList.add("hidden");
  els.composer.hidden = false;
  document.body.style.overflow = "hidden";
  renderComposer();
  els.amount.focus();
}

function closeComposer() {
  state.editingId = null;
  els.composer.hidden = true;
  document.body.style.overflow = "";
}

function openSettings() {
  els.settings.hidden = false;
  document.body.style.overflow = "hidden";
  renderSettings();
}

function closeSettings() {
  els.settings.hidden = true;
  if (els.composer.hidden) document.body.style.overflow = "";
}

function openIconPicker(target) {
  state.iconTarget = target;
  renderIconGrid();
  els.iconPicker.hidden = false;
}

document.getElementById("prevMonth").addEventListener("click", () => {
  state.month = shiftMonth(state.month, -1);
  render();
});
document.getElementById("nextMonth").addEventListener("click", () => {
  state.month = shiftMonth(state.month, 1);
  render();
});
document.getElementById("openSpend").addEventListener("click", () => openComposer("out"));
document.getElementById("openIncome").addEventListener("click", () => openComposer("in"));
document.getElementById("cancel").addEventListener("click", closeComposer);
document.getElementById("openSettings").addEventListener("click", openSettings);
document.getElementById("closeSettings").addEventListener("click", closeSettings);
document.getElementById("lockNow").addEventListener("click", lockNow);
document.getElementById("savePin").addEventListener("click", async () => {
  const pin = document.getElementById("newPin").value;
  const again = document.getElementById("newPinConfirm").value;
  const err = els.pinError;
  err.classList.add("hidden");
  if (pin !== again) {
    err.textContent = "PINs do not match.";
    err.classList.remove("hidden");
    return;
  }
  try {
    const response = await fetch("/api/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not create PIN");
    document.getElementById("newPin").value = "";
    document.getElementById("newPinConfirm").value = "";
    apply(await api("/api/state"));
  } catch (error) {
    err.textContent = error.message;
    err.classList.remove("hidden");
  }
});
document.getElementById("logout").addEventListener("click", async () => {
  stopIdleWatch();
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
});
document.getElementById("closeIcons").addEventListener("click", () => {
  els.iconPicker.hidden = true;
});
els.newIconBtn.addEventListener("click", () => openIconPicker({ type: "new" }));

document.querySelectorAll(".theme-btn").forEach((button) => {
  button.addEventListener("click", async () => {
    applyTheme(button.dataset.theme);
    apply(
      await api("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: button.dataset.theme }),
      }),
    );
  });
});

document.querySelectorAll(".cur").forEach((button) => {
  button.addEventListener("click", () => {
    els.currency.value = button.dataset.value;
    renderComposer();
    els.amount.focus();
  });
});

els.amount.addEventListener("input", renderComposer);

document.getElementById("addCategory").addEventListener("click", async () => {
  const name = els.newCategory.value.trim();
  if (!name) return;
  apply(
    await api("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, icon: state.newIcon || kasaGuessIcon(name) }),
    }),
  );
  els.newCategory.value = "";
  state.newIcon = null;
  renderNewIconButton();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.formError.classList.add("hidden");
  els.save.disabled = true;
  const payload = {
    amount: els.amount.value,
    currency: els.currency.value,
    direction: els.direction.value,
    date: els.date.value,
    category: state.category,
    note: els.note?.value ?? "",
  };
  try {
    apply(
      await api(state.editingId ? `/api/transactions/${state.editingId}` : "/api/transactions", {
        method: state.editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    closeComposer();
  } catch (error) {
    els.formError.textContent = error.message;
    els.formError.classList.remove("hidden");
  } finally {
    els.save.disabled = false;
  }
});

els.deleteTx.addEventListener("click", async () => {
  if (!state.editingId) return;
  apply(await api(`/api/transactions/${state.editingId}`, { method: "DELETE" }));
  closeComposer();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.iconPicker.hidden) {
    els.iconPicker.hidden = true;
    return;
  }
  if (!els.settings.hidden) {
    closeSettings();
    return;
  }
  if (!els.composer.hidden) closeComposer();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((state.ledger.settings?.theme || "system") === "system") applyTheme("system");
});

["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) => {
  window.addEventListener(eventName, noteActivity, { capture: true, passive: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") return;
  if (!state.ledger.me?.hasPin) return;
  if (Date.now() - lastActive >= IDLE_MS) lockNow();
  else noteActivity();
});

api("/api/state")
  .then(apply)
  .catch((error) => {
    els.list.innerHTML = `<div class="empty"><p>${escapeHtml(error.message)}</p></div>`;
  });
