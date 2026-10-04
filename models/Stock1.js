const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
    name: String,
    price: Number,
    quantity: Number,
    total: Number,
    transactionType: { type: String, enum: ["buy", "sell"], required: true },
    timestamp: { type: Date, default: Date.now }, // Optional timestamp
    // Set for buys confirmed through Stripe Checkout, so a payment is recorded only once.
    stripeSessionId: { type: String, unique: true, sparse: true },
});

module.exports = mongoose.model("Purchase", purchaseSchema);
