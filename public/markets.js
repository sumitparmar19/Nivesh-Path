// Markets page: stock search (any US ticker), popular stocks, today's movers and curated stocks by sector.
// Every result links to our own stock page via NP.stockUrl; prices come from /search and /api/stocks/*.
(function () {
  "use strict";
  var NP = window.NP;
  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" }); };
  var pct = function (n) { return n == null || isNaN(n) ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  async function getJSON(url) {
    var res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }
  function logo(symbol) {
    var page = NP.stockPage(symbol);
    return page
      ? '<span class="np-stock-logo"><img src="' + page.logo + '" alt=""></span>'
      : '<span class="np-stock-logo np-stock-logo--text">' + esc(symbol.slice(0, 4)) + "</span>";
  }
  function row(symbol, name, quote) {
    var q = quote || {};
    var dp = q.dp != null ? q.dp : q.changePercent;
    var price = q.c != null ? q.c : q.price;
    return '<a class="np-stock-row" href="' + NP.stockUrl(symbol) + '">' + logo(symbol) +
      '<span class="np-stock-name"><strong>' + esc(name || symbol) + "</strong><small>" + esc(symbol) + "</small></span>" +
      '<span class="np-stock-price"><strong>' + money(price) + '</strong><small class="' + (dp >= 0 ? "np-up" : "np-down") + '">' + pct(dp) + "</small></span></a>";
  }

  // ---------- Popular + movers (the stocks with their own page) ----------
  async function loadPopular() {
    try {
      var quotes = await getJSON("/search");
      var list = NP.stocks.filter(function (s) { return quotes[s.symbol]; });
      $("popular").innerHTML = list.slice(0, 6).map(function (s) {
        var q = quotes[s.symbol];
        return '<a class="np-pop-card" href="' + s.url + '">' +
          '<span class="np-pop-top"><span class="np-stock-logo"><img src="' + s.logo + '" alt=""></span><span><strong>' + s.symbol + "</strong><small>" + esc(s.name) + "</small></span></span>" +
          '<strong class="np-pop-price">' + money(q.c) + '</strong><span class="' + (q.dp >= 0 ? "np-up" : "np-down") + '">' +
          (q.d >= 0 ? "+" : "") + Number(q.d || 0).toFixed(2) + " (" + pct(q.dp) + ")</span></a>";
      }).join("");
      var sorted = list.slice().sort(function (a, b) { return quotes[b.symbol].dp - quotes[a.symbol].dp; });
      $("gainers").innerHTML = sorted.slice(0, 4).map(function (s) { return row(s.symbol, s.name, quotes[s.symbol]); }).join("");
      $("losers").innerHTML = sorted.slice(-4).reverse().map(function (s) { return row(s.symbol, s.name, quotes[s.symbol]); }).join("");
      $("popularUpdated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch (e) {
      $("popular").innerHTML = '<p class="np-muted">Live prices are unavailable right now. Please try again in a minute.</p>';
      $("gainers").innerHTML = $("losers").innerHTML = '<p class="np-muted">Unavailable right now.</p>';
    }
  }

  // ---------- Curated stocks by sector ----------
  var sectors = [];
  async function showSector(index) {
    var sector = sectors[index];
    if (!sector) return;
    document.querySelectorAll("#sectorTabs button").forEach(function (b, i) {
      b.classList.toggle("is-active", i === index);
      b.setAttribute("aria-selected", String(i === index));
    });
    var listEl = $("sectorList");
    listEl.innerHTML = sector.stocks.map(function (s) { return row(s.symbol, s.name, null); }).join("");
    try {
      var quotes = await getJSON("/api/stocks/quotes?symbols=" + sector.stocks.map(function (s) { return s.symbol; }).join(","));
      listEl.innerHTML = sector.stocks.map(function (s) { return row(s.symbol, s.name, quotes[s.symbol]); }).join("");
    } catch (e) { /* rows stay without prices */ }
  }
  async function loadSectors() {
    try {
      sectors = await getJSON("/api/stocks/curated");
      var total = sectors.reduce(function (n, s) { return n + s.stocks.length; }, 0);
      $("curatedCount").textContent = total + " stocks & ETFs";
      $("sectorTabs").innerHTML = sectors.map(function (s, i) {
        return '<button type="button" role="tab" data-i="' + i + '" aria-selected="false">' + esc(s.category) + "</button>";
      }).join("");
      $("sectorTabs").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-i]");
        if (b) showSector(Number(b.getAttribute("data-i")));
      });
      showSector(0);
    } catch (e) {
      $("sectorList").innerHTML = '<p class="np-muted">Sectors are unavailable right now.</p>';
    }
  }

  // ---------- Search any ticker ----------
  var input = $("stockSearch");
  var results = $("searchResults");
  var timer = null;
  var active = -1;
  function closeResults() {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  }
  function renderResults(items, query) {
    var exact = /^[A-Za-z][A-Za-z.]{0,9}$/.test(query) && !items.some(function (r) { return r.symbol === query.toUpperCase(); });
    var html = items.map(function (r) {
      return '<li role="option"><a href="' + NP.stockUrl(r.symbol) + '"><strong>' + esc(r.symbol) + "</strong><span>" + esc(r.name) + "</span>" +
        (r.type ? "<small>" + esc(r.type) + "</small>" : "") + "</a></li>";
    }).join("");
    if (exact) html += '<li role="option"><a href="' + NP.stockUrl(query) + '"><strong>' + esc(query.toUpperCase()) + "</strong><span>Open this ticker</span></a></li>";
    results.innerHTML = html || '<li class="np-muted np-search-empty">No US stocks match "' + esc(query) + '".</li>';
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  async function search(query) {
    try {
      var items = await getJSON("/api/stocks/search?q=" + encodeURIComponent(query));
      if (input.value.trim() === query) renderResults(items, query);
    } catch (e) {
      renderResults([], query);
    }
  }
  input.addEventListener("input", function () {
    var q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 1) { closeResults(); return; }
    timer = setTimeout(function () { search(q); }, 250);
  });
  input.addEventListener("keydown", function (e) {
    var links = results.querySelectorAll("a");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!links.length) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links.forEach(function (a, i) { a.classList.toggle("is-active", i === active); });
    } else if (e.key === "Enter") {
      e.preventDefault();
      var target = links[active >= 0 ? active : 0];
      if (target) location.href = target.getAttribute("href");
      else if (input.value.trim()) location.href = NP.stockUrl(input.value.trim());
    } else if (e.key === "Escape") {
      closeResults();
    }
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".np-market-search")) closeResults(); });

  loadPopular();
  loadSectors();
  setInterval(loadPopular, 60000);
})();
