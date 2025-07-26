// const mongoose = require("mongoose");

// const StockSchema = new mongoose.Schema({
//     stockName: String,
//     quantity: Number,
//     totalPrice: Number,
//     purchaseDate: { type: Date, default: Date.now }
// }, { collection: "stocks" }); // Keep collection name consistent

// // ✅ Prevent model overwrite error
// const Stock = mongoose.models.Stock || mongoose.model("Stock", StockSchema);

// module.exports = { Stock };
const mongoose = require("mongoose");
const stockSchema = require("../schemas/stockSchema");

const Stock = mongoose.model("Stock", stockSchema);
module.exports = Stock;
