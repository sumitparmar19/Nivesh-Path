// Portfolio page: cash, holdings at live prices, allocation donut, recent trades and the AI memory panel.
// Everything comes from protected APIs via NP.authFetch, so signed-out visitors are sent to login.
(function () {
  "use strict";
  const NP = window.NP;
  const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const signed = (n) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${money(Math.abs(n))}`;
  const pct = (n) => `${n > 0 ? "+" : ""}${Number(n || 0).toFixed(2)}%`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const $ = (id) => document.getElementById(id);
  // Requests cancelled by navigating away are not real failures, so don't toast them onto the next page.
  let leaving = false;
  window.addEventListener("beforeunload", () => { leaving = true; });

  // Company pages that exist for each ticker (Apple has no page yet, so it falls back to search).
  const PAGES = {
    NVDA: "Nvidia", TSLA: "Tesla", MSFT: "Microsoft", AMZN: "Amazone", WMT: "Walmart", NKE: "Nike",
    UBER: "Uber", SBUX: "Starbucks", NFLX: "Netflix", GS: "Goldman", ORCL: "Oracle",
  };
  const NAMES = {
    AAPL: "Apple", NVDA: "NVIDIA", TSLA: "Tesla", MSFT: "Microsoft", AMZN: "Amazon", WMT: "Walmart", NKE: "Nike",
    UBER: "Uber", SBUX: "Starbucks", NFLX: "Netflix", GS: "Goldman Sachs", ORCL: "Oracle",
  };
  const pageFor = (symbol) => (PAGES[symbol] ? `/${PAGES[symbol]}.html` : "/search.html");

  // Categorical palette in fixed order (validated light/dark steps); cash is a neutral, not a series.
  const dark = () => document.body.classList.contains("dark-mode");
  const SERIES = {
    light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"],
    dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
  };
  const CASH = { light: "#94a3b8", dark: "#64748b" };
  const MAX_NAMED = 6; // more holdings than this fold into "Other stocks"

  function setTone(el, n) {
    el.classList.toggle("np-up", n > 0);
    el.classList.toggle("np-down", n < 0);
  }

  function showSummary(s) {
    const positions = s.positions || [];
    $("cash").textContent = money(s.cashBalance);
    $("cashFoot").textContent = `${s.totalValue ? ((s.cashBalance / s.totalValue) * 100).toFixed(1) : "100.0"}% of your portfolio is cash`;
    $("holdingsValue").textContent = money(s.holdingsValue);
    $("holdingsFoot").textContent = `${positions.length} holding${positions.length === 1 ? "" : "s"} · unrealized ${signed(s.unrealizedPnl)}`;
    $("totalValue").textContent = money(s.totalValue);
    const pnl = $("totalPnl");
    pnl.textContent = signed(s.totalPnl);
    setTone(pnl, s.totalPnl);
    $("pnlFoot").textContent = `${pct(s.totalPnlPercent)} since you started with ${money(s.totalDeposited)}`;
    $("positionCount").textContent = `${positions.length} holding${positions.length === 1 ? "" : "s"}`;
    $("welcome").hidden = positions.length > 0;
    renderHoldings(positions, s.totalValue);
    renderDonut(positions, s.cashBalance, s.totalValue);
  }

  function renderHoldings(positions, totalValue) {
    const rows = [...positions].sort((a, b) => b.market_value - a.market_value);
    $("holdingsEmpty").hidden = rows.length > 0;
    $("holdingsTable").innerHTML = rows
      .map((p) => {
        const pl = p.market_value - p.cost_basis;
        const plPct = p.cost_basis ? (pl / p.cost_basis) * 100 : 0;
        const weight = totalValue ? (p.market_value / totalValue) * 100 : 0;
        const tone = pl > 0 ? "np-up" : pl < 0 ? "np-down" : "";
        return `<tr>
          <td><span class="np-ticker">${esc(p.symbol.slice(0, 4))}</span><strong>${esc(NAMES[p.symbol] || p.symbol)}</strong></td>
          <td class="num">${esc(+p.quantity.toFixed(4))}</td>
          <td class="num">${money(p.avg_price)}</td>
          <td class="num">${money(p.current_price)}</td>
          <td class="num"><strong>${money(p.market_value)}</strong></td>
          <td class="num ${tone}">${signed(pl)}<br><small>${pct(plPct)}</small></td>
          <td class="num">${weight.toFixed(1)}%</td>
          <td class="num"><a class="np-btn np-btn--ghost np-btn--sm" href="${pageFor(p.symbol)}">Trade</a></td>
        </tr>`;
      })
      .join("");
  }

  function renderDonut(positions, cash, total) {
    const mode = dark() ? "dark" : "light";
    // Colour follows the entity: named holdings take slots in alphabetical order, not by size.
    const bySize = [...positions].sort((a, b) => b.market_value - a.market_value);
    const named = bySize.slice(0, MAX_NAMED).sort((a, b) => a.symbol.localeCompare(b.symbol));
    const rest = bySize.slice(MAX_NAMED);
    const slices = named.map((p, i) => ({ label: p.symbol, value: p.market_value, color: SERIES[mode][i] }));
    if (rest.length) {
      slices.push({ label: `Other stocks (${rest.length})`, value: rest.reduce((s, p) => s + p.market_value, 0), color: SERIES[mode][MAX_NAMED] });
    }
    slices.push({ label: "Cash", value: cash, color: CASH[mode] });

    const r = 48;
    const circ = 2 * Math.PI * r;
    const gap = slices.filter((s) => s.value > 0).length > 1 ? 2 : 0; // 2px surface gap between segments
    let offset = 0;
    $("donut").innerHTML =
      `<circle cx="60" cy="60" r="${r}" stroke="var(--np-line)" stroke-width="22" fill="none"></circle>` +
      slices
        .filter((s) => s.value > 0)
        .map((s) => {
          const len = total ? (s.value / total) * circ : 0;
          const seg = `<circle cx="60" cy="60" r="${r}" stroke="${s.color}" stroke-dasharray="${Math.max(len - gap, 0.5)} ${circ}"
            stroke-dashoffset="${-offset}"><title>${esc(s.label)}: ${money(s.value)} (${((s.value / total) * 100).toFixed(1)}%)</title></circle>`;
          offset += len;
          return seg;
        })
        .join("");
    $("donutTotal").textContent = money(total);
    $("legend").innerHTML = slices
      .map((s) => `<li><span class="sw" style="background:${s.color}"></span><span>${esc(s.label)} <span class="np-muted">· ${money(s.value)}</span></span>
        <span class="pct">${total ? ((s.value / total) * 100).toFixed(1) : "0.0"}%</span></li>`)
      .join("");
  }

  function renderRecent(trades) {
    const recent = [...trades].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
    $("recent").innerHTML = recent.length
      ? recent
          .map((t) => {
            const buy = t.transactionType === "buy";
            const when = t.timestamp ? new Date(t.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
            return `<li><span><span class="np-pill ${buy ? "" : "np-pill--red"}">${buy ? "Buy" : "Sell"}</span>
              <span><strong>${esc(t.quantity)} ${esc(t.name)}</strong> <span class="np-muted">@ ${money(t.price)}</span><br><small class="np-muted">${esc(when)}</small></span></span>
              <b>${money(t.total)}</b></li>`;
          })
          .join("")
      : `<li><span class="np-muted">No trades yet - your buys and sells will appear here.</span></li>`;
  }

  // ---------- AI memory: trades in MongoDB vs trades the advisor can retrieve from ChromaDB ----------
  const INDEX_TEXT = {
    ok: "Rebuilt from the database when the AI service last started",
    running: "Rebuilding from the database right now…",
    pending: "Waiting to rebuild from the database",
    failed: "Last rebuild failed - the advisor still works, without history",
    disabled: "Database link not configured on the AI service",
  };

  function renderMemory(m) {
    const pill = $("memoryPill");
    const btn = $("rebuildBtn");
    $("memDb").textContent = m.tradesInDatabase;
    if (!m.aiReachable) {
      pill.className = "np-pill np-pill--amber";
      pill.innerHTML = '<span class="np-dot np-dot--warn"></span>AI offline';
      $("memIndexed").textContent = "–";
      $("memMeter").style.width = "0%";
      $("memText").textContent = "The AI service isn't reachable right now. Your trades are safe in the database and will be re-indexed when it's back.";
      $("memIndex").textContent = "";
      btn.disabled = true;
      return;
    }
    const indexed = Math.min(m.indexedTrades, m.tradesInDatabase || m.indexedTrades);
    const ratio = m.tradesInDatabase ? indexed / m.tradesInDatabase : 1;
    $("memIndexed").textContent = m.indexedTrades;
    requestAnimationFrame(() => { $("memMeter").style.width = `${Math.round(ratio * 100)}%`; });
    const synced = m.tradesInDatabase === 0 || m.indexedTrades >= m.tradesInDatabase;
    pill.className = `np-pill ${synced ? "" : "np-pill--amber"}`;
    pill.innerHTML = `<span class="np-dot ${synced ? "np-dot--ok" : "np-dot--warn"}"></span>${synced ? "In sync" : "Catching up"}`;
    $("memText").textContent = m.tradesInDatabase === 0
      ? "Once you trade, each order is saved to your account and indexed so the advisor can cite it."
      : synced
        ? `The advisor can recall all ${m.tradesInDatabase} of your trades. They live in the database, so this memory survives every site update.`
        : `The advisor currently recalls ${m.indexedTrades} of ${m.tradesInDatabase} trades. It catches up automatically the next time you ask it something, or re-sync now.`;
    const idx = m.index || {};
    $("memIndex").innerHTML = `<i class="fas fa-database"></i> ${esc(INDEX_TEXT[idx.status] || "Index status unknown")}`;
    btn.disabled = !m.durableStorage;
    btn.title = m.durableStorage ? "Re-index your trades from the database" : "Needs the database link on the AI service";
  }

  async function loadMemory() {
    try {
      const res = await NP.authFetch("/api/ai/memory");
      if (!res.ok) throw new Error();
      renderMemory(await res.json());
    } catch (err) {
      renderMemory({ tradesInDatabase: "–", aiReachable: false });
    }
  }

  $("rebuildBtn").addEventListener("click", async () => {
    const btn = $("rebuildBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-rotate np-spin"></i> Re-syncing…';
    try {
      const res = await NP.authFetch("/api/ai/memory/rebuild", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not re-sync right now.");
      renderMemory(data);
      NP.toast(`The advisor now recalls ${data.indexedTrades} of your trades.`, "success", "Memory re-synced");
    } catch (err) {
      NP.toast(err.message || "Could not re-sync right now.", "error");
      btn.disabled = false;
    } finally {
      btn.innerHTML = '<i class="fas fa-rotate"></i> Re-sync memory';
    }
  });

  async function load() {
    try {
      const me = JSON.parse(localStorage.getItem("niveshPathUser") || "{}");
      if (me.name) $("greeting").textContent = `Hi ${String(me.name).split(" ")[0]}, here's where your money is.`;
    } catch (e) { /* storage blocked */ }
    try {
      const [sumRes, txRes] = await Promise.all([NP.authFetch("/api/portfolio/cash-balance"), NP.authFetch("/api/transactions")]);
      if (!sumRes.ok || !txRes.ok) throw new Error();
      showSummary(await sumRes.json());
      renderRecent(await txRes.json());
    } catch (err) {
      if (leaving) return;
      NP.toast("Couldn't load your portfolio. Please refresh in a moment.", "error");
      $("holdingsTable").innerHTML = "";
      $("recent").innerHTML = '<li><span class="np-muted">Unavailable right now.</span></li>';
    }
    loadMemory();
  }

  if (!NP.isLoggedIn()) {
    NP.authFetch("/api/me"); // redirects to login with ?next=/portfolio.html
    return;
  }
  load();
  setInterval(async () => {
    try {
      const res = await NP.authFetch("/api/portfolio/cash-balance");
      if (res.ok) showSummary(await res.json());
    } catch (e) { /* keep the last good numbers */ }
  }, 60000);
})();
