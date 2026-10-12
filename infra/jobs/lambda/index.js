// The nightly job's only Lambda (Phase 3, PR F). Step Functions calls it with { action } and it calls the LIVE web
// service's token-only /internal/jobs API; it holds no database credentials and no Finnhub key (web fetches the
// quote itself). The token comes from Secrets Manager (nivesh-path/jobs, key AI_INTERNAL_TOKEN), read once per
// container. Errors are thrown with a name Step Functions can match: WebUnavailable (retried with backoff) or
// TokenRejected (web answered 404: the token doesn't match, so retrying can't help; goes straight to the email).
// No dependencies to bundle: Node 22's fetch, and the AWS SDK v3 that the Lambda runtime already includes.

class JobError extends Error {
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

const SYMBOL_RE = /^[A-Z.]{1,10}$/;
const ROUTES = {
  list: () => ({ method: "GET", path: "/internal/jobs/held-tickers" }),
  snapshot: (event) => {
    const symbol = String(event.symbol || "").toUpperCase();
    if (!SYMBOL_RE.test(symbol)) throw new JobError("BadInput", `not a ticker: ${JSON.stringify(event.symbol)}`);
    return { method: "POST", path: `/internal/jobs/snapshots/${symbol}` };
  },
  concentration: () => ({ method: "POST", path: "/internal/jobs/concentration-check" }),
};

/** Reads the internal token from Secrets Manager (the SDK is part of the Lambda Node.js runtime). */
async function tokenFromSecretsManager(secretId) {
  const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
  const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: secretId }));
  const token = JSON.parse(out.SecretString || "{}").AI_INTERNAL_TOKEN;
  if (!token) throw new JobError("BadSecret", `${secretId} has no AI_INTERNAL_TOKEN key`);
  return token;
}

function createHandler({ webUrl, getToken, fetchImpl = fetch, timeoutMs = 25000 }) {
  let tokenPromise = null;
  const base = String(webUrl || "").replace(/\/$/, "");

  return async function handler(event = {}) {
    const route = ROUTES[event.action];
    if (!route) throw new JobError("BadInput", `unknown action: ${JSON.stringify(event.action)}`);
    const { method, path } = route(event);
    if (!base) throw new JobError("BadConfig", "WEB_URL is not set");
    if (!tokenPromise) tokenPromise = getToken().catch((err) => { tokenPromise = null; throw err; });
    const token = await tokenPromise;

    let res;
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers: { "X-Internal-Token": token }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new JobError("WebUnavailable", `${method} ${path}: ${err.name === "TimeoutError" ? `no answer in ${timeoutMs} ms` : err.message}`);
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) throw new JobError("TokenRejected", `${method} ${path}: 404 (the token in Secrets Manager doesn't match the web service's AI_INTERNAL_TOKEN)`);
    if (res.status === 400) throw new JobError("BadInput", `${method} ${path}: ${body.error || "400"}`);
    if (!res.ok) throw new JobError("WebUnavailable", `${method} ${path}: ${res.status} ${body.error || ""}`.trim());
    return body;
  };
}

exports.createHandler = createHandler;
exports.JobError = JobError;
exports.handler = createHandler({
  webUrl: process.env.WEB_URL,
  getToken: () => tokenFromSecretsManager(process.env.TOKEN_SECRET_ID || "nivesh-path/jobs"),
});
