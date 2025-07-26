const express = require("express");
const mongoose = require("mongoose");
const Purchase = require("../models/Stock1"); // Ensure correct path

const router = express.Router(); // ✅ Declare router before using it

// Store purchase data
router.post("/store-purchase", async (req, res) => {
    try {
        const { name,  price, quantity, total, transactionType } = req.body;

        console.log("Received Data:", req.body); // Debugging

        if (!name || !price || !quantity || !total || !transactionType) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Create a new purchase entry
        const newPurchase = new Purchase({name, price, quantity, total, transactionType });
        await newPurchase.save();

        res.status(201).json({ message: "Purchase stored successfully!", purchase: newPurchase });
    } catch (error) {
        console.error("❌ Error storing purchase:", error);
        res.status(500).json({ error: "Error storing purchase" });
    }
});

module.exports = router;

