// Scrubs secrets and personal data from telemetry before it leaves the process: span attributes, span events and
// log fields. Used by src/telemetry.js (traces) and src/lib/logger.js (logs). Rules: drop attributes whose key
// names a credential or header that carries one; in every string value, replace emails, bearer tokens and secret
// query parameters (Finnhub sends its API key as ?token=...). Request bodies are never recorded in the first place.

const SECRET_KEY_RE = /authorization|cookie|x-internal-token|idempotency-key|password|secret|api[-_]?key|jwt|session|email/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_PARAM_RE = /([?&](?:token|apikey|api_key|key|access_token|password|secret)=)[^&#\s]*/gi;
const MONGO_CREDS_RE = /(mongodb(?:\+srv)?:\/\/[^:/@\s]+:)[^@\s]+@/gi;
const PG_CREDS_RE = /(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@\s]+@/gi;
const REDACTED = "[REDACTED]";

/** One string value with emails, bearer tokens, secret query params and connection passwords removed. */
function redactString(value) {
  return value
    .replace(BEARER_RE, "$1 " + REDACTED)
    .replace(SECRET_PARAM_RE, "$1" + REDACTED)
    .replace(MONGO_CREDS_RE, "$1" + REDACTED + "@")
    .replace(PG_CREDS_RE, "$1" + REDACTED + "@")
    .replace(EMAIL_RE, "[email]");
}

function redactValue(value) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? redactString(v) : v));
  return value;
}

/** A copy of an attributes object without credential keys and with every string value scrubbed. */
function redactAttributes(attributes = {}) {
  const out = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (SECRET_KEY_RE.test(key)) continue;
    out[key] = redactValue(value);
  }
  return out;
}

module.exports = { redactAttributes, redactString, SECRET_KEY_RE, REDACTED };
