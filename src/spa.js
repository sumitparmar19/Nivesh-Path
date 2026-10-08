// Serves the React app (frontend/dist) next to the legacy HTML pages, one route at a time.
// Each React route lists the legacy URLs it replaces: while the route is enabled, those URLs 301 to it.
// Setting REACT_DISABLED=/markets,/stock (env) rolls a route back to its legacy HTML without a deploy of
// new code. If the React build is missing, nothing changes and the legacy site keeps working.
const fs = require("fs");
const path = require("path");
const express = require("express");

const TICKER_RE = /^[A-Z][A-Z.]{0,9}$/;
const LEGACY_TICKER_PAGES = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "WMT", "NKE", "UBER", "SBUX", "NFLX", "GS", "ORCL"];
const OLD_COMPANY_PAGES = {
  "/index.html": "AAPL", "/Nvidia.html": "NVDA", "/Tesla.html": "TSLA", "/Microsoft.html": "MSFT", "/Amazone.html": "AMZN",
  "/Walmart.html": "WMT", "/Nike.html": "NKE", "/Uber.html": "UBER", "/Starbucks.html": "SBUX", "/Netflix.html": "NFLX",
  "/Goldman.html": "GS", "/Oracle.html": "ORCL",
};

// React route -> legacy URLs it replaces (a function computes the target when it depends on the request).
const REACT_ROUTES = [
  { route: "/", legacy: ["/psk/index.html"] },
  {
    route: "/login",
    legacy: ["/psk/pages/login.html"],
    target: (req) => {
      const next = req.query.next || req.query.redirect;
      return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? `/login?redirect=${encodeURIComponent(next)}` : "/login";
    },
  },
  { route: "/register", legacy: ["/psk/pages/signup.html"] },
  { route: "/portfolio", legacy: ["/portfolio.html", "/dashboard1.html", "/success.html", "/cancel.html"] },
  { route: "/transactions", legacy: ["/transactions.html"] },
  { route: "/advisor", legacy: ["/advisor.html"] },
  { route: "/behavioral-mirror", legacy: [] }, // new in Phase 2C: no legacy page
  {
    route: "/stock/:symbol",
    legacy: ["/stock.html", ...LEGACY_TICKER_PAGES.map((s) => `/${s}.html`), ...Object.keys(OLD_COMPANY_PAGES)],
    target: (req) => {
      if (req.path === "/stock.html") {
        const sym = String(req.query.symbol || "").toUpperCase();
        return TICKER_RE.test(sym) ? `/stock/${sym}` : "/markets";
      }
      const sym = OLD_COMPANY_PAGES[req.path] || req.path.slice(1, -".html".length);
      return `/stock/${sym}`;
    },
  },
  { route: "/markets", legacy: ["/search.html", "/demo.html"] },
  { route: "/watchlist", legacy: ["/watchlist.html"] },
  { route: "/account", legacy: ["/psk/pages/user-dashboard.html"] },
  { route: "/whats-new", legacy: ["/whats-new.html"] },
  { route: "/about", legacy: ["/psk/pages/about.html", "/psk/pages/products.html", "/psk/pages/pricing.html"] },
  { route: "/contact", legacy: ["/psk/pages/contect.html", "/psk/pages/support.html"] },
];

function disabledRoutes(value = process.env.REACT_DISABLED || "") {
  return new Set(value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s === "/stock" ? "/stock/:symbol" : s)));
}

/** Mounts the React app on `app`. Returns the list of enabled React routes (empty if there is no build). */
function mountSpa(app, { distDir = path.join(__dirname, "..", "frontend", "dist"), disabled = disabledRoutes() } = {}) {
  const indexFile = path.join(distDir, "index.html");
  if (!fs.existsSync(indexFile)) return [];

  // Hashed build assets can be cached for a year; index.html must always be revalidated.
  app.use("/static", express.static(path.join(distDir, "static"), { immutable: true, maxAge: "365d", dotfiles: "deny" }));
  app.get("/logo.png", (req, res) => res.sendFile(path.join(distDir, "logo.png")));

  const sendIndex = (req, res) => res.set("Cache-Control", "no-cache").sendFile(indexFile);
  const enabled = REACT_ROUTES.filter((r) => !disabled.has(r.route));
  for (const r of enabled) {
    app.get(r.route, sendIndex);
    for (const legacy of r.legacy) {
      app.get(legacy, (req, res) => res.redirect(301, r.target ? r.target(req) : r.route));
    }
  }
  return enabled.map((r) => r.route);
}

/** Mount last: any other page URL (not /api, not a file) gets the React "page not found" screen with a 404. */
function mountSpaNotFound(app, { distDir = path.join(__dirname, "..", "frontend", "dist") } = {}) {
  const indexFile = path.join(distDir, "index.html");
  if (!fs.existsSync(indexFile)) return;
  app.get(/^\/(?!api\/|api$)[^.]*$/, (req, res) => res.status(404).set("Cache-Control", "no-cache").sendFile(indexFile));
}

module.exports = { mountSpa, mountSpaNotFound, REACT_ROUTES, disabledRoutes };
