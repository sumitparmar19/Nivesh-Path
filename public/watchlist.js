// Watchlist page: lists the user's watched stocks with live prices, adds a ticker and removes one.
(function () {
  "use strict";
  var NP = window.NP;
  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" }); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  if (!NP.isLoggedIn()) { NP.authFetch("/api/watchlist"); return; } // redirects to login

  var items = [];
  function render(quotes) {
    quotes = quotes || {};
    $("watchEmpty").hidden = items.length > 0;
    $("watchList").innerHTML = items.map(function (w) {
      var page = NP.stockPage(w.symbol);
      var q = quotes[w.symbol] || {};
      var dp = q.changePercent;
      return '<div class="np-watch-row">' +
        '<a class="np-stock-row" href="' + NP.stockUrl(w.symbol) + '">' +
        (page ? '<span class="np-stock-logo"><img src="' + page.logo + '" alt=""></span>' : '<span class="np-stock-logo np-stock-logo--text">' + esc(w.symbol.slice(0, 4)) + "</span>") +
        '<span class="np-stock-name"><strong>' + esc(page ? page.name : w.symbol) + "</strong><small>" + esc(w.symbol) + " · added " +
        new Date(w.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + "</small></span>" +
        '<span class="np-stock-price"><strong>' + money(q.price) + "</strong>" +
        (dp == null ? "<small>—</small>" : '<small class="' + (dp >= 0 ? "np-up" : "np-down") + '">' + (dp >= 0 ? "+" : "") + Number(dp).toFixed(2) + "%</small>") +
        "</span></a>" +
        '<button type="button" class="np-icon-btn" data-remove="' + esc(w.symbol) + '" aria-label="Remove ' + esc(w.symbol) + '"><i class="fas fa-xmark"></i></button></div>';
    }).join("");
  }
  async function load() {
    try {
      var res = await NP.authFetch("/api/watchlist");
      if (!res.ok) throw new Error();
      items = await res.json();
      render();
      if (!items.length) return;
      var qres = await fetch("/api/stocks/quotes?symbols=" + items.map(function (w) { return w.symbol; }).join(","));
      if (qres.ok) render(await qres.json());
    } catch (e) {
      $("watchList").innerHTML = '<p class="np-muted">Your watchlist is unavailable right now.</p>';
    }
  }
  $("watchList").addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-remove]");
    if (!btn) return;
    var symbol = btn.getAttribute("data-remove");
    btn.disabled = true;
    try {
      var res = await NP.authFetch("/api/watchlist/" + encodeURIComponent(symbol), { method: "DELETE" });
      if (!res.ok) throw new Error();
      NP.toast(symbol + " removed from your watchlist.", "success", "Watchlist");
      load();
    } catch (err) {
      btn.disabled = false;
      NP.toast("Couldn't remove " + symbol + ".", "error");
    }
  });
  $("addForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var symbol = $("addSymbol").value.trim().toUpperCase();
    if (!/^[A-Z][A-Z.]{0,9}$/.test(symbol)) { NP.toast("Enter a ticker like AAPL or XOM.", "info"); return; }
    try {
      var check = await fetch("/api/stocks/" + encodeURIComponent(symbol) + "/quote");
      if (!check.ok) throw new Error("We couldn't find " + symbol + " on NYSE or NASDAQ.");
      var res = await NP.authFetch("/api/watchlist", { method: "POST", body: JSON.stringify({ symbol: symbol }) });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || "Couldn't add " + symbol + ".");
      $("addSymbol").value = "";
      NP.toast(symbol + " added to your watchlist.", "success", "Watchlist");
      load();
    } catch (err) {
      NP.toast(err.message, "error");
    }
  });
  load();
  setInterval(load, 60000);
})();
