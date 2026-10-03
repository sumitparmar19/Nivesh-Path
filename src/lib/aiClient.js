// HTTP client for the Python AI service (FastAPI, ai-service/).
const { config } = require("../config");

function createAiClient({ fetchImpl = fetch, baseUrl = config.aiServiceUrl, timeoutMs = 120000 } = {}) {
  async function post(path, body) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.detail ? JSON.stringify(data.detail) : `AI service returned ${response.status}`);
      err.status = response.status === 422 ? 400 : 502;
      throw err;
    }
    return data;
  }

  return {
    analyzePortfolio: (payload) => post("/api/ai/analyze-portfolio", payload),
    ingestTransactions: (userId, transactions) =>
      post("/api/ai/transactions", { user_id: userId, transactions }),
  };
}

module.exports = { createAiClient };
