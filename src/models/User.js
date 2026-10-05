// Mongoose model for registered users (passwords stored as bcrypt hashes).
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    mobile: { type: String, required: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    nickname: String,
    country: { type: String, default: "India" },
    city: String,
    address: String,
    // Preferences saved per account so they follow the user to every device.
    settings: {
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      language: { type: String, default: "English", maxlength: 40 },
      notifications: { type: Boolean, default: true },
    },
    // Virtual paper-trading wallet (Phase 2A): buys debit it, sells credit it.
    cashBalance: { type: Number, default: 100000, min: 0 },
    totalDeposited: { type: Number, default: 100000 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
