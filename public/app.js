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
  iconPicker: document.getElementById("iconPicker"),
  iconGrid: document.getElementById("iconGrid"),
  themeColor: document.getElementById("themeColor"),
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

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.href = data.registered === false ? "/register" : "/login";
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
  const income = rows.reduce((sum, item) => sum + Math.max(0, toCzkHaler(item, rate)), 0);
  const spend = rows.reduce((sum, item) => sum + Math.min(0, toCzkHaler(item, rate)), 0);
  const net = income + spend;

  els.monthLabel.textContent = formatMonthLabel(state.month);
  els.net.textContent = formatCzk(net);
  els.net.classList.toggle("is-neg", net < 0);
  els.income.textContent = formatCzk(income);
  els.spend.textContent = formatCzk(Math.abs(spend));

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
  if (els.accountEmail) {
    els.accountEmail.textContent = state.ledger.me?.email || "";
  }
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
document.getElementById("logout").addEventListener("click", async () => {
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

api("/api/state")
  .then(apply)
  .catch((error) => {
    els.list.innerHTML = `<div class="empty"><p>${escapeHtml(error.message)}</p></div>`;
  });
