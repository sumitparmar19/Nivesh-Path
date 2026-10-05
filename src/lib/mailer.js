// Sends email through Resend's HTTP API (free tier). Optional: without RESEND_API_KEY it does nothing,
// and a failed send never breaks the request that triggered it.
const { config } = require("../config");

function createMailer({ fetchImpl = fetch, apiKey = config.resendApiKey, from = config.mailFrom } = {}) {
  return {
    enabled: Boolean(apiKey),
    async send({ to, subject, text, replyTo }) {
      if (!apiKey || !to) return false;
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, text, reply_to: replyTo }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) console.warn(`Resend returned ${res.status}`);
        return res.ok;
      } catch (err) {
        console.warn("Email not sent:", err.message);
        return false;
      }
    },
  };
}

module.exports = { createMailer };
