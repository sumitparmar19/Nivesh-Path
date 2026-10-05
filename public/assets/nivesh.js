// Nivesh-Path UI layer: mobile menu, active links, toasts (replaces alert), scroll reveal,
// loading skeletons and live price flashes. Loaded with `defer` on every page.
(function () {
  "use strict";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Theme: honour the dark-mode setting saved on the account page ----------
  try {
    if (localStorage.getItem("niveshPathTheme") === "dark") document.body.classList.add("dark-mode");
  } catch (e) { /* storage blocked */ }

  // ---------- Toasts ----------
  var toastBox;
  function toast(message, type, title) {
    if (!message) return;
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "np-toasts";
      toastBox.setAttribute("role", "status");
      toastBox.setAttribute("aria-live", "polite");
      document.body.appendChild(toastBox);
    }
    var kind = type || (/error|fail|invalid|could not|can't|cannot|unable/i.test(message) ? "error" : "success");
    var el = document.createElement("div");
    el.className = "np-toast np-toast--" + kind;
    var head = title || (kind === "error" ? "Something went wrong" : kind === "info" ? "Heads up" : "Done");
    el.innerHTML = "<div><b></b><span></span></div>";
    el.querySelector("b").textContent = head;
    el.querySelector("span").textContent = message;
    toastBox.appendChild(el);
    // Keep the message if the page navigates away right after showing it.
    try { sessionStorage.setItem("np-toast", JSON.stringify({ m: message, k: kind, t: head, at: Date.now() })); } catch (e) {}
    setTimeout(function () {
      el.classList.add("np-out");
      setTimeout(function () { el.remove(); }, 320);
      try { sessionStorage.removeItem("np-toast"); } catch (e) {}
    }, 4200);
  }
  // ---------- Session: JWT stored at login, sent as "Authorization: Bearer" on protected calls ----------
  function clearSession() {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("niveshPathUser");
    } catch (e) {}
  }
  function getToken() {
    try {
      var stored = JSON.parse(localStorage.getItem("niveshPathUser") || "{}");
      var token = localStorage.getItem("token") || stored.token;
      if (!token) return null;
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var payload = JSON.parse(atob(part));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        clearSession();
        return null;
      }
      return token;
    } catch (e) {
      return null;
    }
  }
  function loginUrl() {
    return "/psk/pages/login.html?next=" + encodeURIComponent(location.pathname + location.search);
  }
  function goToLogin(message) {
    toast(message || "Please log in to continue.", "info", "Login required");
    location.href = loginUrl();
    return new Promise(function () {}); // the page is navigating away
  }
  async function authFetch(url, options) {
    options = options || {};
    var token = getToken();
    if (!token) return goToLogin();
    var headers = Object.assign({ "Content-Type": "application/json", Authorization: "Bearer " + token }, options.headers || {});
    var res = await fetch(url, Object.assign({}, options, { headers: headers }));
    if (res.status === 401) {
      clearSession();
      return goToLogin("Your session expired. Please log in again.");
    }
    return res;
  }
  // Store the session after login/sign-up, plus the account's saved settings (so the theme follows the user).
  function saveSession(token, user) {
    user = user || {};
    try {
      localStorage.setItem("token", token);
      localStorage.setItem("niveshPathUser", JSON.stringify({
        isLoggedIn: true, token: token, id: user.id, name: user.name, email: user.email, mobile: user.mobile,
      }));
      var settings = user.settings || {};
      if (settings.theme) localStorage.setItem("niveshPathTheme", settings.theme);
      if (settings.language) localStorage.setItem("niveshPathLanguage", settings.language);
    } catch (e) {}
  }
  function logout() {
    clearSession();
    toast("You have been logged out.", "info", "Signed out");
    location.href = "/psk/index.html";
  }
  getToken(); // drop an expired session before other scripts read it

  // The stocks that have a page on the site (one template, /<TICKER>.html). Every list links through this.
  var STOCK_PAGES = [
    ["AAPL", "Apple", "Apple Inc.", "/img/Apple-Logo-PNG1.png"],
    ["NVDA", "NVIDIA", "NVIDIA Corporation", "/img/nvidia.png"],
    ["TSLA", "Tesla", "Tesla, Inc.", "/img/icons8-tesla-48.png"],
    ["MSFT", "Microsoft", "Microsoft Corporation", "/img/microsoft-logo-png-2395.png"],
    ["AMZN", "Amazon", "Amazon.com, Inc.", "/img/1688364728amazon-icon-black.png"],
    ["WMT", "Walmart", "Walmart Inc.", "/img/Walmart-Logo-PNG-Image.png"],
    ["NKE", "Nike", "NIKE, Inc.", "/img/pngimg.com%20-%20nike_PNG18.png"],
    ["UBER", "Uber", "Uber Technologies, Inc.", "/img/1659777758uber-app-icon.png"],
    ["SBUX", "Starbucks", "Starbucks Corporation", "/img/Starbucks-Logo-PNG4.png"],
    ["NFLX", "Netflix", "Netflix, Inc.", "/img/pngimg.com%20-%20netflix_PNG10.png"],
    ["GS", "Goldman Sachs", "The Goldman Sachs Group, Inc.", "/img/goldman-sachs-new-2022-seeklogo.svg"],
    ["ORCL", "Oracle", "Oracle Corporation", "/img/image_processing20210620-25815-3aus89.png"],
  ].map(function (s) { return { symbol: s[0], name: s[1], company: s[2], logo: s[3], url: "/" + s[0] + ".html" }; });
  function stockPage(symbol) {
    var up = String(symbol || "").toUpperCase();
    for (var i = 0; i < STOCK_PAGES.length; i++) if (STOCK_PAGES[i].symbol === up) return STOCK_PAGES[i];
    return null;
  }
  function stockUrl(symbol) {
    var page = stockPage(symbol);
    return page ? page.url : "/stock.html?symbol=" + encodeURIComponent(String(symbol || "").toUpperCase());
  }

  window.NP = {
    toast: toast, authFetch: authFetch, getToken: getToken, isLoggedIn: function () { return !!getToken(); },
    logout: logout, loginUrl: loginUrl, saveSession: saveSession, stocks: STOCK_PAGES, stockPage: stockPage, stockUrl: stockUrl,
  };
  window.alert = function (msg) { toast(String(msg)); };
  try {
    var pending = JSON.parse(sessionStorage.getItem("np-toast") || "null");
    sessionStorage.removeItem("np-toast");
    if (pending && Date.now() - pending.at < 5000) setTimeout(function () { toast(pending.m, pending.k, pending.t); }, 250);
  } catch (e) {}

  // ---------- Shared layout: one top bar, one sidebar and one footer for every page ----------
  // Pages leave empty placeholders (data-np-nav / data-np-sidebar / data-np-footer); this is the only copy.
  var OWNER = {
    name: "Sumit Parmar",
    github: "https://github.com/sumitparmar19",
    linkedin: "https://www.linkedin.com/in/sumit-parmar-07a544278",
  };
  var SIDEBAR = [
    ["/search.html", "fa-chart-line", "Markets"],
    ["/portfolio.html", "fa-chart-pie", "Portfolio"],
    ["/transactions.html", "fa-receipt", "Transactions"],
    ["/advisor.html", "fa-wand-magic-sparkles", "AI Advisor"],
    ["/watchlist.html", "fa-star", "Watchlist"],
    ["/whats-new.html", "fa-gift", "What's new"],
    ["/psk/pages/user-dashboard.html", "fa-user-circle", "Account"],
  ];
  var TOPNAV = [
    ["/search.html", "Markets"],
    ["/portfolio.html", "Portfolio"],
    ["/advisor.html", "AI Advisor"],
    ["/whats-new.html", "What's new"],
    ["/psk/pages/about.html", "About"],
  ];
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function storedUser() {
    try { return JSON.parse(localStorage.getItem("niveshPathUser") || "{}"); } catch (e) { return {}; }
  }
  function renderLayout() {
    var loggedIn = !!getToken();
    document.querySelectorAll("[data-np-sidebar]").forEach(function (menu) {
      menu.innerHTML = SIDEBAR.map(function (item) {
        return '<a href="' + item[0] + '" class="nav-item"><i class="fas ' + item[1] + '"></i><span>' + item[2] + "</span></a>";
      }).join("");
    });
    document.querySelectorAll("[data-np-nav]").forEach(function (links) {
      var user = storedUser();
      var account = loggedIn
        ? '<a href="/psk/pages/user-dashboard.html" class="np-nav-avatar" aria-label="Your account" title="' + esc(user.name || "Account") + '">' + esc(initials(user.name || user.email)) + "</a>"
        : '<a href="/psk/pages/login.html" class="np-nav-login">Log in</a><a href="/psk/pages/signup.html" class="np-btn np-btn--sm">Sign up</a>';
      links.innerHTML = TOPNAV.map(function (item) { return '<a href="' + item[0] + '">' + item[1] + "</a>"; }).join("") + account;
    });
    document.querySelectorAll("[data-np-footer]").forEach(function (footer) {
      footer.className = "np-footer";
      footer.innerHTML =
        '<div class="np-footer-inner">' +
        '<div class="np-footer-brand"><a href="/" aria-label="Nivesh-Path home"><img src="/psk/finallogo.png" alt="Nivesh-Path"></a>' +
        "<p>Paper-trade US stocks with $100,000 of virtual cash and an AI coach that learns from your own trades.</p></div>" +
        '<nav aria-label="Product"><h4>Product</h4><a href="/search.html">Markets</a><a href="/portfolio.html">Portfolio</a>' +
        '<a href="/transactions.html">Transactions</a><a href="/advisor.html">AI Advisor</a><a href="/watchlist.html">Watchlist</a><a href="/whats-new.html">What\'s new</a></nav>' +
        '<nav aria-label="Project"><h4>Project</h4><a href="/psk/pages/about.html">About &amp; FAQ</a><a href="/psk/pages/contect.html">Contact</a>' +
        '<a href="' + OWNER.github + '" target="_blank" rel="noopener">GitHub</a><a href="' + OWNER.linkedin + '" target="_blank" rel="noopener">LinkedIn</a></nav>' +
        "</div>" +
        '<div class="np-footer-bottom">&copy; ' + new Date().getFullYear() + " Nivesh-Path &middot; A project by " + esc(OWNER.name) +
        " &middot; Educational, not financial advice</div>";
    });
  }
  renderLayout();

  // ---------- Navbar: hamburger on small screens ----------
  var nav = document.querySelector(".navbar");
  if (nav && nav.querySelector(".nav-links") && !nav.querySelector(".np-burger")) {
    var burger = document.createElement("button");
    burger.type = "button";
    burger.className = "np-burger";
    burger.setAttribute("aria-label", "Open menu");
    burger.setAttribute("aria-expanded", "false");
    burger.innerHTML = "<span></span>";
    nav.appendChild(burger);
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("np-open");
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("np-open") && !nav.contains(e.target)) {
        nav.classList.remove("np-open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---------- Highlight the link for the current page ----------
  var here = location.pathname.replace(/\/index\.html$/, "/").toLowerCase();
  document.querySelectorAll(".navbar .nav-links a[href], .nav1 .nav-item[href], .sidebar .nav-item[href]").forEach(function (a) {
    var path;
    try { path = new URL(a.getAttribute("href"), location.href).pathname.replace(/\/index\.html$/, "/").toLowerCase(); } catch (e) { return; }
    if (path === here) a.classList.add("np-current");
  });
  // The sidebar ships with "Home" hard-coded as active; move it to the real page when we found one.
  document.querySelectorAll(".nav1 .nav-menu").forEach(function (menu) {
    if (menu.querySelector(".np-current")) menu.querySelectorAll(".nav-item.active:not(.np-current)").forEach(function (a) { a.classList.remove("active"); });
  });

  // ---------- Trade panel header on stock pages ----------
  var buyBox = document.getElementById("buyBox");
  var symbol = document.body.getAttribute("data-symbol");
  if (buyBox && !buyBox.querySelector(".np-trade-head")) {
    var head = document.createElement("div");
    head.className = "np-trade-head";
    head.innerHTML = '<strong></strong><span class="np-pill">Live</span>';
    head.querySelector("strong").textContent = "Trade " + (symbol || "");
    buyBox.insertBefore(head, buyBox.firstChild);
    var sellRow = buyBox.querySelector(".sell");
    if (sellRow) {
      var note = document.createElement("p");
      note.className = "np-trade-note";
      note.textContent = "Paper trading with virtual cash. Orders fill instantly at the live price.";
      sellRow.insertAdjacentElement("afterend", note);
    }
  }

  // ---------- Loading skeletons ----------
  function markSkeleton(el) {
    if (/^\s*(loading\.*|fetching.*)\s*$/i.test(el.textContent)) el.classList.add("np-skeleton");
    else el.classList.remove("np-skeleton");
  }
  var skeletonTargets = document.querySelectorAll(".clark1 span, .clark2 span, .value, #livePrice, #dayLow, #dayHigh, #walletBalance");
  skeletonTargets.forEach(markSkeleton);

  // ---------- Price flashes + up/down colouring ----------
  function parseNum(text) {
    var n = parseFloat(String(text).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }
  function colourChange(el) {
    var t = el.textContent.trim();
    if (!t || /loading/i.test(t)) return;
    el.classList.toggle("np-down", /^-/.test(t));
    el.classList.toggle("np-up", !/^-/.test(t) && parseNum(t) !== 0);
  }
  var priceEls = document.querySelectorAll('[id^="current-price"], [id^="price-change"], #livePrice, #open, #prevClose');
  if ("MutationObserver" in window) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        var el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el) return;
        markSkeleton(el);
        if (/^price-change/.test(el.id)) colourChange(el);
        var now = parseNum(el.textContent);
        var before = el.__npLast;
        el.__npLast = now;
        if (reduceMotion || before == null || now == null || now === before) return;
        el.classList.remove("np-flash-up", "np-flash-down");
        void el.offsetWidth;
        el.classList.add(now > before ? "np-flash-up" : "np-flash-down");
      });
    });
    priceEls.forEach(function (el) {
      el.__npLast = parseNum(el.textContent);
      observer.observe(el, { childList: true, characterData: true, subtree: true });
    });
    skeletonTargets.forEach(function (el) { observer.observe(el, { childList: true, characterData: true, subtree: true }); });
  }

  // ---------- Scroll reveal ----------
  var revealSel = [
    ".feature-card", ".product-card", ".pricing-card", ".testimonial-card", ".team-member", ".value-item", ".stat-item",
    ".settings-card", ".support-card", ".main > .performance", ".main > .bar1", ".main > .about", ".main > .similar",
    ".simil > a", ".info-item", ".footer-section", ".np-reveal-me"
  ].join(",");
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(revealSel));
  if (!reduceMotion && "IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var target = entry.target;
        target.classList.add("np-in");
        io.unobserve(target);
        // Drop the stagger delay afterwards so hover effects stay instant.
        setTimeout(function () { target.style.transitionDelay = ""; }, 1200);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    revealEls.forEach(function (el) {
      // Stagger siblings for a cascading entrance.
      var i = Array.prototype.indexOf.call(el.parentElement ? el.parentElement.children : [], el);
      el.style.transitionDelay = Math.min(Math.max(i, 0), 6) * 60 + "ms";
      el.classList.add("np-reveal");
      io.observe(el);
    });
  }
})();
