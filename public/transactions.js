// Transactions page: the logged-in user's trades (filter + search) and their cash / portfolio summary.
// All data comes from protected APIs via NP.authFetch, so it redirects to login when signed out.
(function () {
  const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const NP = window.NP;
  let leaving = false; // a fetch cancelled by navigating away is not an error worth a toast
  window.addEventListener("beforeunload", () => { leaving = true; });

  const tbody = document.getElementById("transactionTable");
  const empty = document.getElementById("txEmpty");
  const search = document.getElementById("txSearch");
  let rows = [];
  let filter = "all";

  function render() {
    const q = (search.value || "").trim().toUpperCase();
    const visible = rows.filter((t) => (filter === "all" || t.transactionType === filter) && (!q || String(t.name).toUpperCase().includes(q)));
    tbody.innerHTML = visible
      .map((t) => {
        const isBuy = t.transactionType === "buy";
        const when = t.timestamp || t.createdAt;
        return `<tr>
          <td><span class="np-ticker">${esc(String(t.name).slice(0, 4))}</span><strong>${esc(t.name)}</strong></td>
          <td><span class="np-pill ${isBuy ? "" : "np-pill--red"}"><i class="fas fa-arrow-${isBuy ? "down" : "up"}"></i> ${isBuy ? "Buy" : "Sell"}</span></td>
          <td class="num">${money(t.price)}</td>
          <td class="num">${esc(t.quantity)}</td>
          <td class="num"><strong>${money(t.total)}</strong></td>
          <td class="np-muted">${when ? new Date(when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-"}</td>
        </tr>`;
      })
      .join("");
    empty.hidden = visible.length > 0;
    if (!visible.length && rows.length) {
      empty.querySelector("h3").textContent = "No matching transactions";
      empty.querySelector("p").textContent = "Try another filter or symbol.";
    }
  }

  function showSummary(s) {
    document.getElementById("walletBalance").textContent = money(s.cashBalance);
    document.getElementById("totalValue").textContent = money(s.totalValue);
    document.getElementById("holdingsFoot").textContent = `${money(s.holdingsValue)} in ${s.positions.length} holding${s.positions.length === 1 ? "" : "s"}`;
    const pnl = document.getElementById("totalPnl");
    pnl.textContent = `${s.totalPnl >= 0 ? "+" : ""}${money(s.totalPnl)}`;
    pnl.classList.toggle("np-up", s.totalPnl > 0);
    pnl.classList.toggle("np-down", s.totalPnl < 0);
    document.getElementById("pnlFoot").textContent = `${s.totalPnlPercent >= 0 ? "+" : ""}${s.totalPnlPercent}% since you started with ${money(s.totalDeposited)}`;
  }

  async function load() {
    try {
      const [txRes, sumRes] = await Promise.all([NP.authFetch("/api/transactions"), NP.authFetch("/api/portfolio/cash-balance")]);
      if (!txRes.ok || !sumRes.ok) throw new Error();
      rows = await txRes.json();
      showSummary(await sumRes.json());
    } catch (err) {
      rows = [];
      if (leaving) return;
      NP.toast("Couldn't load your transactions. Please refresh in a moment.", "error");
    }
    render();
  }

  document.querySelectorAll("[data-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      render();
    })
  );
  search.addEventListener("input", render);

  load();
})();
