// HTTP client for the Python AI service (FastAPI, ai-service/).
const { config } = require("../config");

function createAiClient({ fetchImpl = fetch, baseUrl = config.aiServiceUrl, timeoutMs = 120000, internalToken = config.aiInternalToken } = {}) {
  // Shared secret the AI service checks when AI_INTERNAL_TOKEN is set (defence in depth: it isn't public).
  const auth = internalToken ? { "X-Internal-Token": internalToken } : {};
  async function request(method, path, body, ms = timeoutMs) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...auth },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.detail ? JSON.stringify(data.detail) : `AI service returned ${response.status}`);
      err.status = response.status === 422 ? 400 : 502;
      throw err;
    }
    return data;
  }

  const post = (path, body) => request("POST", path, body);
  const memoryPath = (userId) => `/api/ai/memory/${encodeURIComponent(userId)}`;

  return {
    analyzePortfolio: (payload) => post("/api/ai/analyze-portfolio", payload),
    ingestTransactions: (userId, transactions) =>
      post("/api/ai/transactions", { user_id: userId, transactions }),
    // Short timeouts: these feed status panels, which must not hang when the AI service is down.
    health: () => request("GET", "/health", undefined, 5000),
    memory: (userId) => request("GET", memoryPath(userId), undefined, 8000),
    rebuildMemory: (userId) => request("POST", `${memoryPath(userId)}/rebuild`, undefined, 30000),
    deleteMemory: (userId) => request("DELETE", memoryPath(userId), undefined, 10000),
    // Behavioral Mirror coaching insight (numbers computed by the caller) and the last saved one.
    analyzeBehavior: (userId, payload) => request("POST", `/api/ai/behavior/${encodeURIComponent(userId)}`, payload, 60000),
    behaviorInsight: (userId) => request("GET", `/api/ai/behavior/${encodeURIComponent(userId)}`, undefined, 8000),
  };
}

module.exports = { createAiClient };
