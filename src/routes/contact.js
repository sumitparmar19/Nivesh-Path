// Contact form: every message is saved to MongoDB first, then emailed to the site owner via Resend
// when configured. Public (no login needed), rate-limited per IP to stop spam.
const express = require("express");
const rateLimit = require("express-rate-limit");
const { config } = require("../config");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function contactRoutes({ Message, mailer, contactTo = config.contactToEmail }) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
    message: { error: "Too many messages from this connection. Please try again in an hour." } });

  router.post("/api/contact", limiter, async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const subject = String(body.subject || "").trim();
      const message = String(body.message || "").trim();
      if (!name || !email || !message) return res.status(400).json({ error: "Name, email and message are required" });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
      if (name.length > 100 || subject.length > 150 || message.length > 5000) {
        return res.status(400).json({ error: "Your message is too long" });
      }
      const saved = await Message.create({ name, email, subject, message, userId: req.user ? req.user.id : undefined });

      let emailed = false;
      if (mailer && mailer.enabled && contactTo) {
        emailed = await mailer.send({
          to: contactTo,
          subject: `[Nivesh-Path] ${subject || "New message"} - from ${name}`,
          text: `From: ${name} <${email}>\nSubject: ${subject || "(none)"}\n\n${message}`,
          replyTo: email,
        });
        if (emailed && Message.updateOne) await Message.updateOne({ _id: saved._id }, { $set: { emailed: true } }).catch(() => {});
      }
      return res.status(201).json({ success: true, emailed });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = contactRoutes;
