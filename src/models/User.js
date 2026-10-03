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
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
