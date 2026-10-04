// Client logic for the AI Portfolio Advisor page: edit holdings, call the backend, render the insight.
(function () {
  const body = document.getElementById("holdingsBody");
  const form = document.getElementById("advisorForm");
  const results = document.getElementById("results");
  const errorEl = document.getElementById("formError");
  const analyzeBtn = document.getElementById("analyzeBtn");

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const pct = (n) => `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
  const tone = (n) => (n >= 0 ? "up" : "down");

  function addRow(h = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input name="symbol" placeholder="AAPL" maxlength="10" value="${esc(h.symbol || "")}" aria-label="Symbol"></td>
      <td><input name="quantity" type="number" min="0" step="any" value="${esc(h.quantity ?? "")}" aria-label="Quantity"></td>
      <td><input name="avg_price" type="number" min="0" step="any" value="${esc(h.avg_price ?? "")}" aria-label="Average price"></td>
      <td><button type="button" class="icon-btn" aria-label="Remove"><i class="fas fa-trash"></i></button></td>`;
    tr.querySelector("button").addEventListener("click", () => tr.remove());
    body.appendChild(tr);
  }

  async function loadHoldings() {
    body.innerHTML = "";
    try {
      const res = await window.NP.authFetch("/api/portfolio/holdings");
      const holdings = res.ok ? await res.json() : [];
      if (holdings.length) holdings.forEach(addRow);
      else {
        addRow({ symbol: "AAPL", quantity: 10, avg_price: 180 });
        addRow({ symbol: "NVDA", quantity: 5, avg_price: 110 });
      }
    } catch {
      addRow();
    }
  }

  function readHoldings() {
    return [...body.querySelectorAll("tr")]
      .map((tr) => ({
        symbol: tr.querySelector('[name="symbol"]').value.trim().toUpperCase(),
        quantity: Number(tr.querySelector('[name="quantity"]').value),
        avg_price: Number(tr.querySelector('[name="avg_price"]').value),
      }))
      .filter((h) => h.symbol || h.quantity || h.avg_price);
  }

  function render(data) {
    const { metrics: m, insight: ins } = data;
    const positions = m.positions
      .map(
        (p) => `<tr><td><strong>${esc(p.symbol)}</strong></td><td>${money(p.market_value)}</td>
        <td class="${tone(p.unrealized_pl)}">${money(p.unrealized_pl)} (${pct(p.unrealized_pl_pct)})</td><td>${p.weight_pct.toFixed(1)}%</td></tr>`
      )
      .join("");
    const recs = ins.recommendations
      .map(
        (r) => `<div class="rec"><span class="action ${esc(r.action)}">${esc(r.action)}</span>
        <div>${r.symbol ? `<strong>${esc(r.symbol)}</strong> - ` : ""}${esc(r.rationale)}</div></div>`
      )
      .join("");
    const list = (items, icon) => items.map((i) => `<li><i class="fas ${icon}"></i><span>${esc(i)}</span></li>`).join("");

    results.innerHTML = `
      <div class="badges">
        <span class="badge risk-${esc(ins.risk_level)}">Risk: ${esc(ins.risk_level)}</span>
        <span class="badge ${data.ai_generated ? "" : "muted"}">
          ${data.ai_generated ? `<i class="fas fa-wand-magic-sparkles"></i> AI insight · ${esc(data.model || "Claude")}` : "Rule-based insight (AI offline)"}
        </span>
      </div>
      <p class="summary">${esc(ins.summary)}</p>
      ${ins.answer ? `<div class="answer"><strong>Your question:</strong> ${esc(ins.answer)}</div>` : ""}
      <div class="stats">
        <div class="stat"><div class="label">Total value</div><div class="value">${money(m.total_value)}</div></div>
        <div class="stat"><div class="label">Unrealized P/L</div><div class="value ${tone(m.total_unrealized_pl)}">${pct(m.total_unrealized_pl_pct)}</div></div>
        <div class="stat"><div class="label">Largest position</div><div class="value">${esc(m.largest_position)} · ${m.largest_weight_pct.toFixed(0)}%</div></div>
        <div class="stat"><div class="label">Diversification</div><div class="value">${ins.diversification_score}/100</div>
          <div class="meter"><div style="width:${Math.max(0, Math.min(100, ins.diversification_score))}%"></div></div></div>
      </div>
      <div class="two-col">
        <div><h3>Strengths</h3><ul class="list good">${list(ins.strengths, "fa-circle-check")}</ul></div>
        <div><h3>Risks</h3><ul class="list bad">${list(ins.risks, "fa-triangle-exclamation")}</ul></div>
      </div>
      <h3>Recommendations</h3>
      <div class="recs">${recs}</div>
      <h3>Positions</h3>
      <div class="table-scroll"><table class="positions">
        <thead><tr><th>Symbol</th><th>Value</th><th>P/L</th><th>Weight</th></tr></thead><tbody>${positions}</tbody>
      </table></div>
      ${data.relevant_history.length ? `<h3>History the advisor used</h3><ul class="history">${data.relevant_history.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
      <p class="disclaimer">${esc(data.disclaimer)}</p>`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const holdings = readHoldings();
    if (!holdings.length || holdings.some((h) => !h.symbol || !(h.quantity > 0) || !(h.avg_price > 0))) {
      errorEl.textContent = "Every holding needs a symbol, a quantity and an average price above 0.";
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.querySelector("span").innerHTML = '<span class="spinner"></span> Analyzing…';
    try {
      const res = await window.NP.authFetch("/api/ai/analyze-portfolio", {
        method: "POST",
        body: JSON.stringify({
          holdings,
          risk_profile: document.getElementById("riskProfile").value,
          question: document.getElementById("question").value.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      render(data);
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong. Please try again.";
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.querySelector("span").textContent = "Analyze my portfolio";
    }
  });

  document.getElementById("addRowBtn").addEventListener("click", () => addRow());
  document.getElementById("reloadBtn").addEventListener("click", loadHoldings);
  loadHoldings();
})();
