// Registration and login with bcrypt-hashed passwords and JWT access tokens.
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { config } = require("../config");

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
  };
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
      return res.status(201).json({ message: "Registration successful", user: publicUser(user) });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  router.post("/api/login", async (req, res) => {
    try {
      const { mobile, password } = req.body || {};
      if (!mobile || !password) return res.status(400).json({ message: "Mobile and password are required" });

      const user = await User.findOne({ mobile });
      const ok = user && (await bcrypt.compare(String(password), user.passwordHash));
      if (!ok) return res.status(401).json({ message: "Invalid mobile number or password" });

      const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: "7d" });
      return res.json({ token, ...publicUser(user) });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  return router;
}

// Optional middleware for routes that should know who is calling.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    try {
      req.userId = jwt.verify(header.slice(7), config.jwtSecret).sub;
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  }
  next();
}

module.exports = { authRoutes, optionalAuth };
