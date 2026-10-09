// Runs the Behavioral Mirror rules after a trade (and the concentration rule when prices move) and saves what
// they find to `behavioral_events`. It never throws: market data or database problems skip detection (logged)
// and the trade is unaffected. The trade route waits for it at most DETECTION_BUDGET_MS so the trade panel can
// show a note when it's ready.
const rules = require("./behaviorRules");

const DETECTION_BUDGET_MS = 1500;
const PRICE_CHECK_INTERVAL_MS = 15 * 60 * 1000; // concentration re-check from price moves, per user

function createBehaviorDetector({ BehaviorEvent, Purchase, marketData, ledger, log = console, now = () => Date.now() }) {
  const lastPriceCheck = new Map(); // userId -> ms (single web instance; good enough for a throttle)

  // 5-day return + 52-week high (daily data) and today's move + intraday high (live quote). Either half may
  // be missing; null when neither is available, so the trade is not counted as checked.
  async function marketFacts(symbol) {
    const [m, q] = await Promise.allSettled([marketData.momentum(symbol), marketData.quote(symbol)]);
    if (m.status === "rejected" && q.status === "rejected") {
      log.warn(`[behavior] market data unavailable for ${symbol}, panic/FOMO skipped: ${m.reason && m.reason.message}`);
      return null;
    }
    const mo = m.status === "fulfilled" ? m.value : {};
    const qu = q.status === "fulfilled" ? q.value : {};
    return { fiveDayReturn: mo.fiveDayReturn ?? null, week52High: mo.week52High ?? null, todayChange: qu.changePercent ?? null, dayHigh: qu.high ?? null };
  }

  // Overconcentration: record new/worse crossings over 35%, and clear active events that fell back under it.
  async function checkConcentration(userId, tradeId = null) {
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
      const facts = tradeId ? s.facts : { ...s.facts, fromPriceMove: true };
      created.push(await BehaviorEvent.create({ userId, patternType: "overconcentration", severity: s.severity, tradeId, symbol: s.symbol, facts, ruleVersion: rules.RULE_VERSION }));
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
        const input = { side, symbol, price: trade.price, quantity: trade.quantity, avgCost, ...m };
        for (const hit of [rules.panicSell(input), rules.fomoBuy(input)]) {
          if (hit) created.push(await BehaviorEvent.create({ userId, tradeId: trade._id, ruleVersion: rules.RULE_VERSION, ...hit }));
        }
        // Only trades that were really checked count in the impulse-control score.
        if (Purchase) await Purchase.updateOne({ _id: trade._id, userId }, { $set: { behaviorCheckedAt: new Date() } });
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

  /**
   * Concentration check without a trade: a stock can grow past 35% (or fall back) through price moves alone.
   * Runs at most once per 15 minutes per user; never rejects.
   */
  async function checkPrices(userId) {
    const key = String(userId);
    const last = lastPriceCheck.get(key);
    if (last !== undefined && now() - last < PRICE_CHECK_INTERVAL_MS) return [];
    lastPriceCheck.set(key, now());
    try {
      return await checkConcentration(userId, null);
    } catch (err) {
      log.warn(`[behavior] price-move concentration check skipped: ${err.message}`);
      return [];
    }
  }

  return { detect, detectWithin, checkPrices };
}

module.exports = { createBehaviorDetector, DETECTION_BUDGET_MS, PRICE_CHECK_INTERVAL_MS };
