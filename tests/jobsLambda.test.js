// The nightly job's Lambda (infra/jobs/lambda/index.js): each action calls the right /internal/jobs route with
// the token, the token is read once, and failures carry the error names the Step Functions retry/catch rules use.
const { createHandler } = require("../infra/jobs/lambda/index.js");

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, token: init.headers["X-Internal-Token"] });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { status: next.status, ok: next.status < 300, json: async () => next.body || {} };
  };
  return { calls, fetchImpl };
}

describe("nightly job Lambda", () => {
  test("list / snapshot / concentration call the right routes with the token, read once", async () => {
    const { calls, fetchImpl } = fakeFetch([
      { status: 200, body: { symbols: ["AAPL"] } },
      { status: 200, body: { symbol: "AAPL", saved: true } },
      { status: 200, body: { users: 1, created: 0, failed: 0 } },
    ]);
    const getToken = jest.fn(async () => "tok");
    const handler = createHandler({ webUrl: "https://web.example/", getToken, fetchImpl });
    expect(await handler({ action: "list" })).toEqual({ symbols: ["AAPL"] });
    expect(await handler({ action: "snapshot", symbol: "aapl" })).toEqual({ symbol: "AAPL", saved: true });
    expect(await handler({ action: "concentration" })).toEqual({ users: 1, created: 0, failed: 0 });
    expect(calls).toEqual([
      { url: "https://web.example/internal/jobs/held-tickers", method: "GET", token: "tok" },
      { url: "https://web.example/internal/jobs/snapshots/AAPL", method: "POST", token: "tok" },
      { url: "https://web.example/internal/jobs/concentration-check", method: "POST", token: "tok" },
    ]);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  test("a 404 means the token doesn't match: TokenRejected (not retried)", async () => {
    const handler = createHandler({ webUrl: "https://web.example", getToken: async () => "old", ...fakeFetch([{ status: 404 }]) });
    await expect(handler({ action: "list" })).rejects.toMatchObject({ name: "TokenRejected" });
  });

  test("5xx or a network error: WebUnavailable (retried with backoff by Step Functions)", async () => {
    const handler = createHandler({ webUrl: "https://web.example", getToken: async () => "t", ...fakeFetch([{ status: 502, body: { error: "Quote unavailable" } }, new Error("ECONNRESET")]) });
    await expect(handler({ action: "snapshot", symbol: "AAPL" })).rejects.toMatchObject({ name: "WebUnavailable", message: expect.stringContaining("502 Quote unavailable") });
    await expect(handler({ action: "list" })).rejects.toMatchObject({ name: "WebUnavailable", message: expect.stringContaining("ECONNRESET") });
  });

  test("bad input never calls the web service", async () => {
    const { calls, fetchImpl } = fakeFetch([]);
    const handler = createHandler({ webUrl: "https://web.example", getToken: async () => "t", fetchImpl });
    await expect(handler({ action: "drop-tables" })).rejects.toMatchObject({ name: "BadInput" });
    await expect(handler({ action: "snapshot", symbol: "../../etc" })).rejects.toMatchObject({ name: "BadInput" });
    expect(calls).toEqual([]);
  });

  test("a failed token read is retried on the next call, not cached", async () => {
    const getToken = jest.fn().mockRejectedValueOnce(new Error("throttled")).mockResolvedValue("t");
    const handler = createHandler({ webUrl: "https://web.example", getToken, ...fakeFetch([{ status: 200, body: { symbols: [] } }]) });
    await expect(handler({ action: "list" })).rejects.toThrow("throttled");
    await expect(handler({ action: "list" })).resolves.toEqual({ symbols: [] });
  });
});
