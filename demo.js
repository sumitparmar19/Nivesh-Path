// server.js (runs in Node.js)

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose")
const fetch = require("node-fetch");
const bodyParser = require("body-parser");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Stock = require("./models/Stock1.js");
const app = express();
const path = require("path")
const PORT = 3000;
const bcrypt = require("bcrypt");
const uri = process.env.MONGO_URL;
app.use(express.json());
app.use(bodyParser.raw({ type: "application/json" }));
app.use(express.static("public"));
const purchaseRoutes = require("./routes/stockRoutes");
app.use(purchaseRoutes);
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static(path.join(__dirname, "public")));
// app.get("/search", async (req, res) => {
//   const apiKey = process.env.FINNHUB_API_KEY;
//   const stockSymbol = "AAPL";
//   const url = `https://finnhub.io/api/v1/quote?symbol=${stockSymbol}&token=${apiKey}`;

//   try {
//     const response = await fetch(url);
//     const data = await response.json();
//     res.json(data);
//   } catch (error) {
//     console.error("Error fetching stock price:", error);
//     res.status(500).json({ error: "Failed to fetch stock price" });
//   }
// });
// app.get("/search", async (req, res) => {
//   const apiKey = process.env.FINNHUB_API_KEY;
//   const stockSymbol = req.query.symbol; // Get symbol from query params

//   if (!stockSymbol) {
//       return res.status(400).json({ error: "Stock symbol is required" });
//   }

//   const url = `https://finnhub.io/api/v1/quote?symbol=${stockSymbol}&token=${apiKey}`;

//   try {
//       const response = await fetch(url);
//       const data = await response.json();
//       res.json(data);
//   } catch (error) {
//       console.error(`Error fetching ${stockSymbol} stock price:`, error);
//       res.status(500).json({ error: "Failed to fetch stock price" });
//   }
// });
app.get("/search", async (req, res) => {
  const apiKey = process.env.FINNHUB_API_KEY;
  const symbols = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "WMT", "NKE", "UBER", "SBUX", "NFLX", "GS","ORCL"];
  let stockData = {};

  try {
    for (const symbol of symbols) {
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.c) { // Check if data is valid
        stockData[symbol] = data;
      } else {
        console.error(`⚠️ Error fetching ${symbol}:`, data);
      }
    }
    
    if (Object.keys(stockData).length === 0) {
      return res.status(500).json({ error: "Failed to fetch stock prices" });
    }

    res.json(stockData);
  } catch (error) {
    console.error("❌ Server Error:", error);
    res.status(500).json({ error: "Failed to fetch stock prices" });
  }
});
const apiKey = process.env.FINNHUB_API_KEY;

app.use(cors()); // Enable CORS globally

app.get("/stock/:symbol", async (req, res) => {
  const symbol = req.params.symbol;
  try {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("API Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

app.get("/api/get-api-key", (req, res) => {
  res.json({ apiKey: process.env.FINNHUB_API_KEY });
});

app.get('/yahoo', async (req, res) => {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d';

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Error fetching Yahoo Finance data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  mongoose.connect(uri);
  console.log("DBconnected")
});
// app.get('/demo', async (req, res) => {
//   const symbol = req.query.symbol;
//   const apiKey = process.env.FINNHUB_API_KEY;
//   const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;

//   try {
//     const response = await fetch(url);
//     const data = await response.json();
//     res.json(data);
//   } catch (error) {
//     console.error("API Error:", error);
//     res.status(500).send("Server Error");
//   }
// });

// require('dotenv').config();
// const express = require('express');
// const fetch = require('node-fetch');

// const app = express();
// const PORT = 3000;

app.get('/stock', async (req, res) => {
    const stockSymbol = req.query.symbol || 'AAPL';
    const apiKey = process.env.FINNHUB_API_KEY;

    try {
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${stockSymbol}&token=${apiKey}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch stock data" });
    }
});

// app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 


// app.post("/create-checkout-session", async (req, res) => {
//   try {
//     const { amount } = req.body;

//     if (!amount) {
//       return res.status(400).json({ error: "Amount is required" });
//     }

//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ["card"],
//       line_items: [
//         {
//           price_data: {
//             currency: "usd",
//             product_data: { name: "Apple" },
//             unit_amount: amount, 
//           },
//           quantity: 1,
//         },
//       ],
//       mode: "payment",
//       success_url: "http://localhost:3000/success.html",
//       cancel_url: "http://localhost:3000/cancel.html",
//     });

//     console.log("✅ Session Created:", session.id);
//     res.json({ id: session.id }); // ✅ Send correct ID to frontend
//   } catch (error) {
//     console.error("❌ Stripe Error:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// app.post("/create-checkout-session", async (req, res) => {
//   const { amount } = req.body;
//   if (!amount || isNaN(amount)) {
//       return res.status(400).json({ error: "Invalid amount" });
//   }

//   try {
//       const session = await stripe.checkout.sessions.create({
//           payment_method_types: ["card"],
//           line_items: [{
//               price_data: {
//                   currency: "usd",
//                   product_data: { name: "Stock Purchase" },
//                   unit_amount: Math.round(amount * 100), // Convert to cents
//               },
//               quantity: 1,
//           }],
//           mode: "payment",
//           success_url: "http://localhost:3000/success.html",
//           cancel_url: "http://localhost:3000/cancel.html",
//       });

//       res.json({ url: session.url });
//   } catch (error) {
//       res.status(500).json({ error: error.message });
//   }
// });
// app.post("/create-checkout-session", async (req, res) => {
//   const { amount, transactionType } = req.body;

//   console.log("Received request:", req.body); // Debugging

//   if (!amount || isNaN(amount)) {
//       return res.status(400).json({ error: "Invalid amount" });
//   }

//   try {
//       if (transactionType === "buy") {
//           const session = await stripe.checkout.sessions.create({
//               payment_method_types: ["card"],
//               line_items: [{
//                   price_data: {
//                       currency: "usd",
//                       product_data: { name: "Stock Purchase" },
//                       unit_amount: Math.round(amount * 100),
//                   },
//                   quantity: 1,
//               }],
//               mode: "payment",
//               success_url: "http://localhost:3000/success",
//               cancel_url: "http://localhost:3000/cancel",
//           });

//           console.log("Checkout session created:", session.url);
//           return res.json({ url: session.url });

//       } else if (transactionType === "sell") {
//           const payout = await stripe.payouts.create({
//               amount: Math.round(amount * 100),
//               currency: "usd",
//           });

//           console.log("Payout initiated:", payout);
//           return res.json({ message: "Payout initiated", payoutId: payout.id });
//       }
//   } catch (error) {
//       console.error("Error in /create-checkout-session:", error); // Debugging
//       return res.status(500).json({ error: error.message });
//   }
// });

// const StockSchema = new mongoose.Schema({
//   price: Number,
//   quantity: Number,
//   total: Number,
//   stripePaymentId: String,
//   timestamp: { type: Date, default: Date.now },
// });

// const Stock = mongoose.model("Stock", StockSchema);

app.post("/create-checkout-session", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Apple Inc",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-nvidia", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Nvidia corporation",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-nvidia:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-tesla", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Tesla INC",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-nvidia:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-microsoft", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Micrsoft corp",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-microsoft:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-amazone", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Amazone INC",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-amazone:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-walmart", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Walmart INC",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-walmart:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-nike", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "NIKE INC",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-nike:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-uber", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Uber Technologies, Inc",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-uber:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-starbucks", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Starbucks Corporation",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-starbucks:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-netflix", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Starbucks Corporation",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-netflix:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-goldman", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "usd",
                  product_data: { 
                    name: "Goldman Sachs Group, Inc.",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-goldman:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
app.post("/create-checkout-session-oracle", async (req, res) => {
  const { amount, transactionType } = req.body;

  console.log("Received request:", req.body); // Debugging

  if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
  }

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
              price_data: {
                  currency: "inr",
                  product_data: { 
                    name: "Oracle Corporation",
                    images: ["https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png"] // Set logo
                },
                  unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
          }],
          mode: "payment", // Selling also treated as a payment session
          success_url: "http://localhost:3000/transactions.html",
          cancel_url: "http://localhost:3000/cancel.html",
      });

      console.log("Checkout session created:", session.url);
      return res.json({ url: session.url });

  } catch (error) {
      console.error("Error in /create-checkout-session-oracle:", error); // Debugging
      return res.status(500).json({ error: error.message });
  }
});
mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

// // Routes
// app.use("/api", purchaseRoutes); // Mount the purchase routes


// Start the server


// app.listen(3000, () => console.log("Server running on port 3000"));

// console.log("Stripe Secret Key:", process.env.STRIPE_SECRET_KEY ? "Loaded" : "Not Loaded");
// Start the server
// app.listen(3000, () => console.log("Server running on port 3000"));


// const MONGO_URL = process.env.MONGO_URL;

// mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => console.log("✅ MongoDB Connected"))
//   .catch(err => console.log("❌ MongoDB Connection Error:", err));

  // mongoose.connect("mongodb+srv://dhrumil:dhrumil7pat@niveshpathcluster.egrir.mongodb.net/Nivesh?retryWrites=true&w=majority&appName=NiveshPathCluster")
  // const PriceSchema = new mongoose.Schema({
  //   price: Number,
  //   quantity: Number,
  //   total: { $sum: { $multiply: ["$price", "$quantity"] } } // ✅ Ensure total is included
  // });
  // const Price = mongoose.model("Price", PriceSchema);
  
  // app.get("/", function(req, res) {
  //   res.sendFile((__dirname + "success.html"));
  // })
  
  // app.post("/", function(req, res){
  //   console.log("Received Data:", req.body.total);
  //   let newPrice = new Price({
  //     price: req.body.price,
  //     quantity: req.body.quantity,
  //     total: req.body.total
  //   });
  //   newPrice.save()
  //     .then(() => res.send("Data saved successfully!"))
  //     .catch((err) => res.status(500).send("Error saving data"));
  // });
//   app.post("/store-purchase", async (req, res) => {
//     try {
//         const { price, quantity, total } = req.body;

//         if (!price || !quantity || !total || !transactionType) {
//             return res.status(400).json({ error: "Missing required fields" });
//         }

//         const newStock = new Stock({ price, quantity, total, transactionType});
//         await newStock.save();

//         res.status(201).json({ message: "Purchase saved successfully!" });
//     } catch (error) {
//         console.error("Error saving purchase:", error);
//         res.status(500).json({ error: "Server error" });
//     }
// });
app.post("/store-purchase", async (req, res) => {
  try {
      const { name, price, quantity, total, transactionType } = req.body;

      console.log("Received data:", req.body); // Debugging log

      if (!name || !price || !quantity || !total || !transactionType) {
          return res.status(400).json({ error: "Missing required fields" });
      }

      const newPurchase = new Purchase({ name, price, quantity, total, transactionType });
      await newPurchase.save();

      res.status(201).json({ message: "Purchase saved successfully!", purchase: newPurchase });
  } catch (error) {
      console.error("Error saving purchase:", error);
      res.status(500).json({ error: "Server error" });
  }
});
const Purchase = require("./models/Stock1"); // Adjust path if needed

app.get("/transactions", async (req, res) => {
  try {
      const transactions = await Purchase.find(); // Fetch all transactions from MongoDB
      res.json(transactions);
  } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Server error" });
  }
});
const userSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Register endpoint (update your existing endpoint)
app.post('/api/register', async (req, res) => {
    try {
        const { mobile, password, name, email } = req.body;

        // Validate input
        if (!mobile || !password || !name || !email) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [
                { mobile: mobile },
                { email: email }
            ]
        });

        if (existingUser) {
            return res.status(400).json({ 
                message: 'User with this mobile number or email already exists' 
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = new User({
            mobile,
            password: hashedPassword,
            name,
            email
        });

        // Save user to database
        await newUser.save();

        // Send success response
        res.status(201).json({ 
            message: 'Registration successful',
            user: {
                name: newUser.name,
                email: newUser.email,
                mobile: newUser.mobile
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { mobile, password, name, email } = req.body;
        
        // Find user by mobile number
        const user = await User.findOne({ mobile });
        if (!user) {
            return res.status(401).json({ message: 'Invalid mobile number or password' });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid mobile number or password' });
        }
        // Send user data (excluding password)
        const userData = {
            mobile: user.mobile,
            name: user.name,
            email: user.email,
            isLoggedIn: true
        };

        res.json(userData);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});