// Runs the Behavioral Mirror rules after a trade and saves what they find to `behavioral_events`.
// It never throws: market data or database problems skip detection (logged) and the trade is unaffected.
// The trade route waits for it at most DETECTION_BUDGET_MS so the trade panel can show a note when it's ready.
const rules = require("./behaviorRules");

const DETECTION_BUDGET_MS = 1500;

function createBehaviorDetector({ BehaviorEvent, marketData, ledger, log = console }) {
  async function marketFacts(symbol) {
    try {
      return await marketData.momentum(symbol);
    } catch (err) {
      log.warn(`[behavior] market data unavailable for ${symbol}, panic/FOMO skipped: ${err.message}`);
      return null;
    }
  }

  // Overconcentration: record new/worse crossings over 35%, and clear active events that fell back under it.
  async function checkConcentration(userId, tradeId) {
    const summary = await ledger.summary(userId);
    const shares = rules.concentration({ positions: summary.positions, cashBalance: summary.cashBalance });
    const bySymbol = Object.fromEntries(shares.map((s) => [s.symbol, s]));
    const active = await BehaviorEvent.find({ userId, patternType: "overconcentration", clearedAt: null }).sort({ createdAt: -1 }).lean();
    const latestActive = {};
    for (const e of active) if (!latestActive[e.symbol]) latestActive[e.symbol] = e;

    const stillHigh = (symbol) => bySymbol[symbol] && bySymbol[symbol].severity;
    const toClear = active.filter((e) => !stillHigh(e.symbol)).map((e) => e._id);
    if (toClear.length) await BehaviorEvent.updateMany({ _id: { $in: toClear } }, { $set: { clearedAt: new Date() } });

    const created = [];
    for (const s of shares) {
      if (!rules.shouldRecordConcentration(latestActive[s.symbol], s.severity)) continue;
      created.push(await BehaviorEvent.create({ userId, patternType: "overconcentration", severity: s.severity, tradeId, symbol: s.symbol, facts: s.facts }));
    }
    return created;
  }

  /** Detect patterns for one saved trade. Resolves to the events created (possibly none); never rejects. */
  async function detect({ userId, trade, avgCost }) {
    const side = trade.transactionType;
    const symbol = trade.name;
    const created = [];
    try {
      const m = await marketFacts(symbol);
      if (m) {
        const input = { side, symbol, price: trade.price, fiveDayReturn: m.fiveDayReturn, week52High: m.week52High, avgCost };
        for (const hit of [rules.panicSell(input), rules.fomoBuy(input)]) {
          if (hit) created.push(await BehaviorEvent.create({ userId, tradeId: trade._id, ...hit }));
        }
      }
    } catch (err) {
      log.warn(`[behavior] panic/FOMO detection skipped: ${err.message}`);
    }
    try {
      created.push(...(await checkConcentration(userId, trade._id)));
    } catch (err) {
      log.warn(`[behavior] overconcentration check skipped: ${err.message}`);
    }
    return created.map((e) => (typeof e.toObject === "function" ? e.toObject() : e));
  }

  /** detect(), but give up waiting after `ms`: resolves to the events if ready in time, else null. */
  function detectWithin(args, ms = DETECTION_BUDGET_MS) {
    const work = detect(args);
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }

  return { detect, detectWithin };
}

module.exports = { createBehaviorDetector, DETECTION_BUDGET_MS };
