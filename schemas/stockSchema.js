// const { Schema } = require("mongoose");
// const Orderschema = new Schema({
//     name: String,
//     qty: Number,
//     price: Number,
//     mode: String,

// });

// module.exports = { Orderschema }
// const mongoose = require("mongoose");

// const StockSchema = new mongoose.Schema({
//     stockName: String,
//     quantity: Number,
//     totalPrice: Number,
//     purchaseDate: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model("Stock", StockSchema);
// const mongoose = require("mongoose");

// const stockSchema = new mongoose.Schema({
//   price: { type: Number, required: true },
//   quantity: { type: Number, required: true },
//   total: { type: Number, required: true }
// }, { timestamps: true });

// module.exports = stockSchema;
const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema({
  name: {type:String , required: true},
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  total: { type: Number, required: true },
  transactionType: { type: String, enum: ["buy", "sell"], required: true } // Add buy/sell mode
}, { timestamps: true });

module.exports = mongoose.model("Stock", stockSchema);

