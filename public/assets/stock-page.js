// Shared logic for every stock page (<body data-symbol="TSLA">): live quote, embedded TradingView chart,
// key stats, company profile, news, the user's position and the watchlist star. Replaces the 12 per-page
// scripts; all data comes from our own /api/stocks/* endpoints, so no API key reaches the browser.
(function () {
  "use strict";
  var NP = window.NP;
  var body = document.body;
  var symbol = body.getAttribute("data-symbol");
  var exchange = body.getAttribute("data-exchange") || "";
  if (!symbol || !NP) return;
  var tvSymbol = exchange ? exchange + ":" + symbol : symbol; // TradingView resolves a bare ticker too

  var $ = function (id) { return document.getElementById(id); };
  if ($("stockSym")) $("stockSym").textContent = symbol;
  var money = function (n) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" }); };
  var num = function (n, d) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d }); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function bigMoney(millions) {
    if (millions == null || isNaN(millions)) return "—";
    var v = Number(millions) * 1e6;
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    return "$" + (v / 1e6).toFixed(0) + "M";
  }
  async function getJSON(url) {
    var res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  // ---------- Live quote (server caches 60s; poll every 30s) ----------
  var lastPrice = null;
  function renderQuote(q) {
    if (!q || !(q.price > 0)) return;
    lastPrice = q.price;
    var up = q.change >= 0;
    var changeText = (up ? "+" : "") + num(q.change) + " (" + (up ? "+" : "") + num(q.changePercent) + "%)";
    $("headPrice").textContent = money(q.price);
    $("headChange").textContent = changeText;
    $("headChange").className = up ? "np-up" : "np-down";
    $("livePrice").textContent = money(q.price);
    $("dayLow").textContent = money(q.low);
    $("dayHigh").textContent = money(q.high);
    $("open").textContent = money(q.open);
    $("prevClose").textContent = money(q.prevClose);
    $("dayChange").textContent = changeText;
    $("dayChange").className = "value " + (up ? "np-up" : "np-down");
    var priceInput = $("price");
    if (priceInput) {
      priceInput.value = q.price;
      priceInput.dispatchEvent(new Event("input"));
    }
    var range = q.high - q.low;
    if (range > 0) {
      $("ticker").style.left = Math.min(Math.max(((q.price - q.low) / range) * 100, 0), 100) + "%";
      $("openMarker").style.left = Math.min(Math.max(((q.open - q.low) / range) * 100, 0), 100) + "%";
    }
    document.title = symbol + " " + money(q.price) + " · " + (body.getAttribute("data-name") || symbol) + " | Nivesh-Path";
    renderPosition();
  }
  async function loadQuote() {
    try { renderQuote(await getJSON("/api/stocks/" + symbol + "/quote")); }
    catch (e) { if (lastPrice == null) $("headChange").textContent = "Price unavailable right now"; }
  }

  // ---------- Order total ----------
  var qty = $("quantity");
  var total = $("total");
  function updateTotal() {
    var q = parseInt(qty.value, 10);
    total.value = q > 0 && lastPrice ? (q * lastPrice).toFixed(2) : "";
  }
  if (qty && total) {
    qty.addEventListener("input", updateTotal);
    $("price").addEventListener("input", updateTotal);
  }

  // ---------- Embedded chart (TradingView widget inside our page; never a navigation link) ----------
  var chartMode = "overview";
  function loadChart() {
    var box = $("graphContainer");
    if (!box) return;
    box.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
    var theme = body.classList.contains("dark-mode") ? "dark" : "light";
    var script = document.createElement("script");
    script.async = true;
    if (chartMode === "overview") {
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
      script.textContent = JSON.stringify({
        symbols: [[body.getAttribute("data-name") || symbol, tvSymbol + "|1D"]],
        chartType: "area", autosize: true, colorTheme: theme, isTransparent: true, showVolume: false,
        lineColor: "#16a34a", topColor: "rgba(22,163,74,0.25)", bottomColor: "rgba(22,163,74,0)",
        dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"],
      });
    } else {
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.textContent = JSON.stringify({
        symbol: tvSymbol, autosize: true, interval: "D", theme: theme, style: "1",
        locale: "en", allow_symbol_change: false, hide_side_toolbar: true, save_image: false,
      });
    }
    box.firstChild.appendChild(script);
  }
  var toggle = $("chartToggle");
  if (toggle) toggle.addEventListener("click", function () { chartMode = chartMode === "overview" ? "advanced" : "overview"; loadChart(); });

  // ---------- Key stats (Finnhub basic financials) ----------
  async function loadMetrics() {
    var box = $("keyStats");
    try {
      var m = await getJSON("/api/stocks/" + symbol + "/metrics");
      var rows = [
        ["Market cap", bigMoney(m.marketCap)],
        ["P/E (TTM)", num(m.peTTM)],
        ["EPS (TTM)", m.epsTTM == null ? "—" : money(m.epsTTM)],
        ["52-week high", money(m.week52High)],
        ["52-week low", money(m.week52Low)],
        ["Beta", num(m.beta)],
        ["Dividend yield", m.dividendYield == null ? "—" : num(m.dividendYield) + "%"],
        ["10-day avg. volume", m.avgVolume10d == null ? "—" : num(m.avgVolume10d) + "M"],
      ];
      box.innerHTML = rows.map(function (r) { return '<div><span>' + r[0] + "</span><strong>" + r[1] + "</strong></div>"; }).join("");
    } catch (e) {
      box.innerHTML = '<p class="np-muted">Key stats are unavailable right now.</p>';
    }
  }

  // ---------- Company profile + news ----------
  async function loadProfile() {
    var box = $("profile");
    try {
      var p = await getJSON("/api/stocks/" + symbol + "/profile");
      if (p.logo) $("stockLogo").src = p.logo;
      if (p.name) {
        var shortName = p.name.replace(/,? (Inc\.?|Corp(oration)?\.?|Co\.?|Ltd\.?|plc|Group|Holdings)$/i, "");
        if (!body.getAttribute("data-name") || body.getAttribute("data-name") === symbol) {
          body.setAttribute("data-name", shortName);
          $("stockTitle").textContent = shortName;
          if ($("aboutTitle")) $("aboutTitle").textContent = shortName;
        }
      }
      $("stockMeta").textContent = [p.name, p.exchange, p.industry].filter(Boolean).join(" · ");
      var facts = [
        ["Company", esc(p.name)],
        ["Industry", esc(p.industry || "—")],
        ["Exchange", esc(p.exchange || "—")],
        ["Country", esc(p.country || "—")],
        ["Listed since", esc(p.ipo || "—")],
        ["Website", p.website ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + "</a>" : "—"],
      ];
      box.innerHTML = '<div class="np-facts">' + facts.map(function (f) { return "<div><span>" + f[0] + "</span><strong>" + f[1] + "</strong></div>"; }).join("") + "</div>";
    } catch (e) {
      box.innerHTML = '<p class="np-muted">Company profile is unavailable right now.</p>';
    }
  }
  async function loadNews() {
    var box = $("news");
    try {
      var items = await getJSON("/api/stocks/" + symbol + "/news");
      box.innerHTML = items.length
        ? items.map(function (n) {
            var when = n.datetime ? new Date(n.datetime * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
            return '<li><a href="' + esc(n.url) + '" target="_blank" rel="noopener"><strong>' + esc(n.headline) + "</strong>" +
              '<span class="np-muted">' + esc(n.source) + (when ? " · " + when : "") + ' <i class="fas fa-arrow-up-right-from-square"></i></span></a></li>';
          }).join("")
        : '<li class="np-muted">No recent news for ' + symbol + ".</li>";
    } catch (e) {
      box.innerHTML = '<li class="np-muted">News is unavailable right now.</li>';
    }
  }

  // ---------- The user's position in this stock ----------
  var holding = null;
  var tradeCount = 0;
  function renderPosition() {
    var el = $("positionText");
    if (!el || !NP.isLoggedIn()) return;
    if (!holding) {
      el.innerHTML = "You don't own " + symbol + " yet." + (tradeCount ? " " + tradeCount + " past trade" + (tradeCount === 1 ? "" : "s") + ' · <a href="/transactions.html">history</a>' : "");
      return;
    }
    var price = lastPrice || holding.avg_price;
    var value = price * holding.quantity;
    var pl = value - holding.avg_price * holding.quantity;
    var plPct = holding.avg_price ? (pl / (holding.avg_price * holding.quantity)) * 100 : 0;
    el.innerHTML =
      '<span class="np-pos-grid">' +
      "<span>Shares<strong>" + num(holding.quantity, 4) + "</strong></span>" +
      "<span>Avg cost<strong>" + money(holding.avg_price) + "</strong></span>" +
      "<span>Value<strong>" + money(value) + "</strong></span>" +
      '<span>P&amp;L<strong class="' + (pl >= 0 ? "np-up" : "np-down") + '">' + (pl >= 0 ? "+" : "-") + money(Math.abs(pl)) + " (" + num(plPct) + "%)</strong></span>" +
      "</span>";
  }
  async function loadPosition() {
    if (!NP.isLoggedIn()) {
      $("positionText").innerHTML = '<a href="' + NP.loginUrl() + '">Log in</a> to trade ' + symbol + " and see your position.";
      return;
    }
    try {
      var results = await Promise.all([NP.authFetch("/api/portfolio/holdings"), NP.authFetch("/api/transactions")]);
      var holdings = results[0].ok ? await results[0].json() : [];
      var trades = results[1].ok ? await results[1].json() : [];
      holding = holdings.filter(function (h) { return h.symbol === symbol; })[0] || null;
      tradeCount = trades.filter(function (t) { return String(t.name).toUpperCase() === symbol; }).length;
      renderPosition();
    } catch (e) { /* keep the login/empty text */ }
  }
  document.addEventListener("np:trade", loadPosition);

  // ---------- Watchlist star ----------
  var watchBtn = $("watchBtn");
  function setWatched(on) {
    watchBtn.setAttribute("aria-pressed", String(on));
    watchBtn.classList.toggle("is-on", on);
    watchBtn.innerHTML = '<i class="' + (on ? "fas" : "far") + ' fa-star"></i> <span>' + (on ? "Watching" : "Watch") + "</span>";
  }
  async function loadWatch() {
    if (!NP.isLoggedIn()) return;
    try {
      var res = await NP.authFetch("/api/watchlist");
      if (!res.ok) return;
      var list = await res.json();
      setWatched(list.some(function (w) { return w.symbol === symbol; }));
    } catch (e) {}
  }
  if (watchBtn) {
    watchBtn.addEventListener("click", async function () {
      if (!NP.isLoggedIn()) { location.href = NP.loginUrl(); return; }
      var on = watchBtn.getAttribute("aria-pressed") !== "true";
      watchBtn.disabled = true;
      try {
        var res = on
          ? await NP.authFetch("/api/watchlist", { method: "POST", body: JSON.stringify({ symbol: symbol }) })
          : await NP.authFetch("/api/watchlist/" + symbol, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setWatched(on);
        NP.toast(on ? symbol + " added to your watchlist." : symbol + " removed from your watchlist.", "success", "Watchlist");
      } catch (e) {
        NP.toast("Couldn't update your watchlist. Please try again.", "error");
      } finally {
        watchBtn.disabled = false;
      }
    });
  }

  // ---------- More stocks (every other stock with a page) ----------
  async function loadMore() {
    var box = $("moreStocks");
    if (!box) return;
    var others = NP.stocks.filter(function (s) { return s.symbol !== symbol; });
    box.innerHTML = others.map(function (s) {
      return '<a class="np-stock-row" href="' + s.url + '"><span class="np-stock-logo"><img src="' + s.logo + '" alt=""></span>' +
        '<span class="np-stock-name"><strong>' + esc(s.name) + '</strong><small>' + s.symbol + " · " + esc(s.company) + "</small></span>" +
        '<span class="np-stock-price" data-q="' + s.symbol + '">—</span></a>';
    }).join("");
    try {
      var quotes = await getJSON("/search");
      others.forEach(function (s) {
        var q = quotes[s.symbol];
        var cell = box.querySelector('[data-q="' + s.symbol + '"]');
        if (!q || !cell) return;
        cell.innerHTML = "<strong>" + money(q.c) + '</strong><small class="' + (q.dp >= 0 ? "np-up" : "np-down") + '">' + (q.dp >= 0 ? "+" : "") + num(q.dp) + "%</small>";
      });
    } catch (e) {}
  }

  loadQuote();
  setInterval(loadQuote, 30000);
  loadChart();
  loadMetrics();
  loadProfile();
  loadNews();
  loadPosition();
  loadWatch();
  loadMore();
})();
