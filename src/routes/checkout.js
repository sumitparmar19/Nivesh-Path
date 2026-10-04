// Stripe Checkout: one generic handler replaces the old copy-pasted per-company routes.
// A buy is recorded only after /api/checkout/confirm verifies with Stripe that it was paid.
const express = require("express");
const { config, STOCKS, CHECKOUT_SLUGS } = require("../config");

const SESSION_ID_RE = /^cs_[A-Za-z0-9_]+$/;

function checkoutRoutes({ stripe, Purchase, aiClient }) {
  const router = express.Router();

  async function createSession(req, res, symbol) {
    const body = req.body || {};
    const quantity = Number(body.quantity);
    const price = Number(body.price);
    // New pages send quantity + price; older callers send only a total amount.
    const amount = quantity > 0 && price > 0 ? quantity * price : Number(body.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (!stripe) {
      return res.status(503).json({ error: "Payments are not configured (STRIPE_SECRET_KEY missing)" });
    }
    try {
      const label = symbol ? `${STOCKS[symbol]} (${symbol})` : "Stock Purchase";
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: quantity > 0 ? `${quantity} × ${label}` : label,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${config.publicBaseUrl}/transactions.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.publicBaseUrl}/cancel.html`,
        metadata: {
          symbol: symbol || "",
          quantity: quantity > 0 ? String(quantity) : "",
          price: price > 0 ? String(price) : "",
          transactionType: "buy",
        },
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

  // Called by transactions.html after Stripe redirects back with ?session_id=...
  router.post("/api/checkout/confirm", async (req, res) => {
    const sessionId = String((req.body && req.body.session_id) || "");
    if (!SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: "Invalid session id" });
    if (!stripe) return res.status(503).json({ error: "Payments are not configured" });

    try {
      const existing = await Purchase.findOne({ stripeSessionId: sessionId });
      if (existing) return res.json({ status: "already_recorded", purchase: existing });

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        return res.status(402).json({ error: "Payment was not completed" });
      }
      const meta = session.metadata || {};
      const quantity = Number(meta.quantity);
      const price = Number(meta.price);
      if (!meta.symbol || !(quantity > 0) || !(price > 0)) {
        return res.json({ status: "no_trade_details" });
      }

      let purchase;
      try {
        purchase = await Purchase.create({
          name: meta.symbol,
          price,
          quantity,
          total: (session.amount_total || Math.round(price * quantity * 100)) / 100,
          transactionType: "buy",
          stripeSessionId: sessionId,
        });
      } catch (err) {
        // Two tabs confirming the same payment at once: the unique index keeps one record.
        if (err && err.code === 11000) {
          return res.json({ status: "already_recorded", purchase: await Purchase.findOne({ stripeSessionId: sessionId }) });
        }
        throw err;
      }

      if (aiClient) {
        aiClient
          .ingestTransactions("anonymous", [
            { symbol: purchase.name, quantity, price, transaction_type: "buy", timestamp: purchase.timestamp },
          ])
          .catch((err) => console.warn("AI ingest skipped:", err.message));
      }
      return res.status(201).json({ status: "recorded", purchase });
    } catch (err) {
      console.error("Checkout confirm error:", err.message);
      return res.status(500).json({ error: "Could not confirm payment" });
    }
  });

  return router;
}

module.exports = checkoutRoutes;
