// Trade record (buy or sell) owned by one user. `name` holds the ticker symbol, e.g. "TSLA".
const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
    // Owner of the trade; every query filters on it so portfolios stay private.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: String,
    price: Number,
    quantity: Number,
    total: Number,
    transactionType: { type: String, enum: ["buy", "sell"], required: true },
    timestamp: { type: Date, default: Date.now },
    // "live" when the server priced the trade from Finnhub, "client" when it fell back to the page's price.
    priceSource: { type: String, enum: ["live", "client"], default: "live" },
});

purchaseSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.models.Purchase || mongoose.model("Purchase", purchaseSchema);
