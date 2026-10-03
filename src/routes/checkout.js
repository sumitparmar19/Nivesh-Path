// Stripe Checkout: one generic handler replaces the old copy-pasted per-company routes.
const express = require("express");
const { config, STOCKS, CHECKOUT_SLUGS } = require("../config");

function checkoutRoutes({ stripe }) {
  const router = express.Router();

  async function createSession(req, res, symbol) {
    const amount = Number(req.body && req.body.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (!stripe) {
      return res.status(503).json({ error: "Payments are not configured (STRIPE_SECRET_KEY missing)" });
    }
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: symbol ? `${STOCKS[symbol]} (${symbol})` : "Stock Purchase" },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${config.publicBaseUrl}/transactions.html`,
        cancel_url: `${config.publicBaseUrl}/cancel.html`,
        metadata: { symbol: symbol || "", transactionType: String(req.body.transactionType || "buy") },
      });
      return res.json({ id: session.id, url: session.url });
    } catch (err) {
      console.error("Stripe error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  router.post("/create-checkout-session", (req, res) => {
    const symbol = req.body && req.body.symbol ? String(req.body.symbol).toUpperCase() : null;
    if (symbol && !STOCKS[symbol]) return res.status(400).json({ error: "Unknown symbol" });
    return createSession(req, res, symbol);
  });

  // Legacy routes still called by the company pages, e.g. /create-checkout-session-tesla.
  router.post("/create-checkout-session-:slug", (req, res) => {
    const symbol = CHECKOUT_SLUGS[req.params.slug.toLowerCase()];
    if (!symbol) return res.status(404).json({ error: "Unknown stock" });
    return createSession(req, res, symbol);
  });

  return router;
}

module.exports = checkoutRoutes;
