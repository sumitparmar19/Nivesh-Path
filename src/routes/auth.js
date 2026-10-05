// Registration and login with bcrypt-hashed passwords and JWT access tokens.
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { config } = require("../config");
const { requireAuth } = require("../middleware/auth");

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    nickname: user.nickname || "",
    country: user.country || "India",
    city: user.city || "",
    address: user.address || "",
    cashBalance: user.cashBalance ?? 100000,
    settings: {
      theme: (user.settings && user.settings.theme) || "light",
      language: (user.settings && user.settings.language) || "English",
      notifications: user.settings ? user.settings.notifications !== false : true,
    },
    createdAt: user.createdAt,
  };
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email }, config.jwtSecret, { expiresIn: "7d" });
}

function authRoutes({ User }) {
  const router = express.Router();

  router.post("/api/register", async (req, res) => {
    try {
      const { name, email, mobile, password } = req.body || {};
      if (!name || !email || !mobile || !password) {
        return res.status(400).json({ message: "Name, email, mobile and password are required" });
      }
      if (String(password).length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const normalizedEmail = String(email).trim().toLowerCase();
      const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { mobile }] });
      if (existing) return res.status(409).json({ message: "An account with this email or mobile already exists" });

      const passwordHash = await bcrypt.hash(String(password), 10);
      const user = await User.create({ name, email: normalizedEmail, mobile, passwordHash });
      return res.status(201).json({ message: "Registration successful", token: signToken(user), user: publicUser(user) });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  router.post("/api/login", async (req, res) => {
    try {
      const { mobile, email, password } = req.body || {};
      const login = String(mobile || email || "").trim();
      if (!login || !password) return res.status(400).json({ message: "Mobile (or email) and password are required" });

      const user = await User.findOne(login.includes("@") ? { email: login.toLowerCase() } : { mobile: login });
      const ok = user && (await bcrypt.compare(String(password), user.passwordHash));
      if (!ok) return res.status(401).json({ message: "Invalid mobile number or password" });

      return res.json({ token: signToken(user), user: publicUser(user), ...publicUser(user) });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // Current user's profile (used by the account page and navbar).
  router.get("/api/me", requireAuth, async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(401).json({ error: "Account not found. Please log in again." });
      return res.json(publicUser(user));
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { authRoutes, publicUser };
