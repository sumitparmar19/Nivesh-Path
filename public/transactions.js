// Transactions page: confirms a returning Stripe payment, then lists trades with filters and totals.
(function () {
  const START_BALANCE = 100000;
  const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const toast = (m, t, h) => (window.NP ? window.NP.toast(m, t, h) : console.log(m));

  const tbody = document.getElementById("transactionTable");
  const empty = document.getElementById("txEmpty");
  const search = document.getElementById("txSearch");
  let rows = [];
  let filter = "all";

  async function confirmPayment() {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    // Remove the id from the address bar so a refresh doesn't re-confirm.
    history.replaceState(null, "", location.pathname);
    try {
      const res = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.purchase) {
        const p = data.purchase;
        toast(`Bought ${p.quantity} ${p.name} for ${money(p.total)}.`, "success", "Payment confirmed");
      } else if (!res.ok) {
        toast(data.error || "We couldn't confirm that payment.", "error");
      }
    } catch (err) {
      toast("We couldn't confirm that payment. Check your connection and refresh.", "error");
    }
  }

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

  function summarise() {
    const bought = rows.filter((t) => t.transactionType === "buy");
    const sold = rows.filter((t) => t.transactionType === "sell");
    const sum = (list) => list.reduce((acc, t) => acc + Number(t.total || 0), 0);
    document.getElementById("walletBalance").textContent = money(START_BALANCE - sum(bought) + sum(sold));
    document.getElementById("totalBought").textContent = money(sum(bought));
    document.getElementById("totalSold").textContent = money(sum(sold));
    document.getElementById("buyCount").textContent = `${bought.length} buy${bought.length === 1 ? "" : "s"}`;
    document.getElementById("sellCount").textContent = `${sold.length} sell${sold.length === 1 ? "" : "s"}`;
  }

  async function load() {
    try {
      const res = await fetch("/transactions");
      if (!res.ok) throw new Error();
      rows = await res.json();
    } catch (err) {
      rows = [];
      toast("Couldn't load your transactions. Please refresh in a moment.", "error");
    }
    summarise();
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

  confirmPayment().finally(load);
})();
