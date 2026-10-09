// One-time, repeat-safe clean-up after the Behavioral Mirror rules changed (rule version 2): re-checks every
// older panic/FOMO event with the current rules from its stored facts. Events that no longer qualify were
// false alarms and are deleted, but their trade is first marked as checked so it still counts as a clean
// trade in the impulse score. The rest are re-graded. Trades made since Phase 2C launched were all checked,
// so they get `behaviorCheckedAt` too. Runs at server start; logs the counts; never throws.
const rules = require("./behaviorRules");

// Phase 2C went live (PR #9 merged) at this time: trades from then on went through the detectors.
const PHASE_2C_LAUNCH = new Date("2026-10-09T02:13:00Z");

async function migrateBehaviorEvents({ BehaviorEvent, Purchase, log = console }) {
  const counts = { checked: 0, deleted: 0, regraded: 0, unchanged: 0, tradesMarked: 0 };
  try {
    const old = await BehaviorEvent.find({ ruleVersion: { $ne: rules.RULE_VERSION } }).lean();
    for (const e of old) {
      counts.checked += 1;
      const markTrade = async () => {
        if (!e.tradeId) return;
        await Purchase.updateOne(
          { _id: e.tradeId, userId: e.userId, behaviorCheckedAt: { $exists: false } },
          { $set: { behaviorCheckedAt: e.createdAt || new Date() } }
        );
      };
      const now = rules.regrade(e);
      if (!now) {
        await markTrade(); // change 4: the trade stays in the score as a clean checked trade
        await BehaviorEvent.deleteOne({ _id: e._id });
        counts.deleted += 1;
        continue;
      }
      if (e.patternType !== "overconcentration") await markTrade();
      const changed = now.severity !== e.severity;
      await BehaviorEvent.updateOne({ _id: e._id }, { $set: { severity: now.severity, facts: now.facts, ruleVersion: rules.RULE_VERSION } });
      counts[changed ? "regraded" : "unchanged"] += 1;
    }
    const marked = await Purchase.updateMany(
      { timestamp: { $gte: PHASE_2C_LAUNCH }, behaviorCheckedAt: { $exists: false } },
      { $set: { behaviorCheckedAt: PHASE_2C_LAUNCH } }
    );
    counts.tradesMarked = (marked && (marked.modifiedCount ?? marked.nModified)) || 0;
    log.log(`[behavior] rule v${rules.RULE_VERSION} clean-up: ${JSON.stringify(counts)}`);
  } catch (err) {
    log.warn(`[behavior] rule clean-up failed (will retry on next start): ${err.message}`);
  }
  return counts;
}

module.exports = { migrateBehaviorEvents, PHASE_2C_LAUNCH };
