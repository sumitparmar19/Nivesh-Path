// The signed-in user's own account: profile, settings, password, initials avatar, and deleting the account
// with all of its data. Everything is saved to MongoDB so it follows the user to any device.
const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth } = require("../middleware/auth");
const { publicUser } = require("./auth");

const PROFILE_FIELDS = { name: 100, nickname: 60, email: 200, mobile: 20, country: 60, city: 60, address: 200 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\+?[0-9 ()-]{6,20}$/;
const THEMES = ["light", "dark"];
const AVATAR_COLORS = ["#16a34a", "#2a78d6", "#eb6834", "#7c3aed", "#0891b2", "#db2777", "#ca8a04", "#4f46e5"];

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Initials + a colour picked from a hash of the name, so the same user always gets the same avatar.
function avatarSvg(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase().replace(/[^A-Z0-9?]/g, "?");
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${color}"/>` +
    `<text x="64" y="64" dy=".35em" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="52" font-weight="700" fill="#fff">${initials}</text></svg>`;
}

function accountRoutes({ User, Purchase, Watchlist, Analysis, aiClient }) {
  const router = express.Router();

  async function currentUser(req) {
    const user = await User.findById(req.user.id);
    if (!user) {
      const err = new Error("Account not found. Please log in again.");
      err.status = 401;
      throw err;
    }
    return user;
  }

  router.patch("/api/me", requireAuth, async (req, res, next) => {
    try {
      const body = req.body || {};
      const updates = {};
      for (const [field, max] of Object.entries(PROFILE_FIELDS)) {
        if (body[field] === undefined) continue;
        const value = String(body[field] ?? "").trim();
        if (value.length > max) throw badRequest(`${field} must be at most ${max} characters`);
        updates[field] = value;
      }
      if ("name" in updates && !updates.name) throw badRequest("Name can't be empty");
      if ("email" in updates) {
        updates.email = updates.email.toLowerCase();
        if (!EMAIL_RE.test(updates.email)) throw badRequest("Enter a valid email address");
      }
      if ("mobile" in updates && !MOBILE_RE.test(updates.mobile)) throw badRequest("Enter a valid mobile number");
      if (!Object.keys(updates).length) throw badRequest("Nothing to update");

      const clash = [];
      if (updates.email) clash.push({ email: updates.email });
      if (updates.mobile) clash.push({ mobile: updates.mobile });
      if (clash.length) {
        const other = await User.findOne({ $or: clash });
        if (other && String(other._id) !== String(req.user.id)) {
          return res.status(409).json({ error: "Another account already uses that email or mobile number" });
        }
      }
      const user = await User.findOneAndUpdate({ _id: req.user.id }, { $set: updates }, { new: true });
      if (!user) return res.status(401).json({ error: "Account not found. Please log in again." });
      return res.json(publicUser(user));
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "Another account already uses that email or mobile number" });
      return next(err);
    }
  });

  router.get("/api/me/settings", requireAuth, async (req, res, next) => {
    try {
      return res.json(publicUser(await currentUser(req)).settings);
    } catch (err) {
      return next(err);
    }
  });

  router.patch("/api/me/settings", requireAuth, async (req, res, next) => {
    try {
      const body = req.body || {};
      const set = {};
      if (body.theme !== undefined) {
        if (!THEMES.includes(body.theme)) throw badRequest("theme must be light or dark");
        set["settings.theme"] = body.theme;
      }
      if (body.language !== undefined) {
        const language = String(body.language).trim();
        if (!language || language.length > 40) throw badRequest("Invalid language");
        set["settings.language"] = language;
      }
      if (body.notifications !== undefined) set["settings.notifications"] = Boolean(body.notifications);
      if (!Object.keys(set).length) throw badRequest("Nothing to update");
      const user = await User.findOneAndUpdate({ _id: req.user.id }, { $set: set }, { new: true });
      if (!user) return res.status(401).json({ error: "Account not found. Please log in again." });
      return res.json(publicUser(user).settings);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/api/me/password", requireAuth, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) throw badRequest("Enter your current and new password");
      if (String(newPassword).length < 6) throw badRequest("New password must be at least 6 characters");
      const user = await currentUser(req);
      if (!(await bcrypt.compare(String(currentPassword), user.passwordHash))) {
        return res.status(403).json({ error: "Your current password is not correct" });
      }
      const passwordHash = await bcrypt.hash(String(newPassword), 10);
      await User.updateOne({ _id: req.user.id }, { $set: { passwordHash } });
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  });

  router.get("/api/me/avatar", requireAuth, async (req, res, next) => {
    try {
      const user = await currentUser(req);
      res.set("Content-Type", "image/svg+xml").set("Cache-Control", "private, max-age=300");
      return res.send(avatarSvg(user.name));
    } catch (err) {
      return next(err);
    }
  });

  // Permanently removes the account and everything tied to it (trades, watchlist, analyses, AI memory).
  router.delete("/api/me", requireAuth, async (req, res, next) => {
    try {
      const { password, confirm } = req.body || {};
      if (confirm !== "DELETE") throw badRequest('Type DELETE to confirm');
      const user = await currentUser(req);
      if (!password || !(await bcrypt.compare(String(password), user.passwordHash))) {
        return res.status(403).json({ error: "Your password is not correct" });
      }
      const userId = req.user.id;
      await Promise.all([
        Purchase.deleteMany({ userId }),
        Watchlist ? Watchlist.deleteMany({ userId }) : null,
        Analysis ? Analysis.deleteMany({ userId }) : null,
      ]);
      await User.deleteOne({ _id: userId });
      if (aiClient && aiClient.deleteMemory) {
        aiClient.deleteMemory(userId).catch((err) => console.warn("AI memory not deleted:", err.message));
      }
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { accountRoutes, avatarSvg };
