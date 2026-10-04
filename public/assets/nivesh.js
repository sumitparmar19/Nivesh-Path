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
  window.NP = { toast: toast };
  window.alert = function (msg) { toast(String(msg)); };
  try {
    var pending = JSON.parse(sessionStorage.getItem("np-toast") || "null");
    sessionStorage.removeItem("np-toast");
    if (pending && Date.now() - pending.at < 5000) setTimeout(function () { toast(pending.m, pending.k, pending.t); }, 250);
  } catch (e) {}

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
      note.textContent = "Buys are paid securely with Stripe (test mode). Sells are recorded instantly.";
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
