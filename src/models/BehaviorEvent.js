// One Behavioral Mirror detection (panic sell, FOMO buy or overconcentration) tied to a user and usually a trade.
// Stored in its own collection: `behavioral_patterns` belongs to the AI service's PatternStore (one summary
// per user per pattern type, unique index), so per-trade events can't live there.
const mongoose = require("mongoose");

const behaviorEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patternType: { type: String, required: true, enum: ["panic_sell", "fomo_buy", "overconcentration"] },
    severity: { type: String, required: true, enum: ["low", "medium", "high"] },
    tradeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    symbol: { type: String, required: true, maxlength: 10 },
    facts: { type: mongoose.Schema.Types.Mixed, default: {} }, // numbers computed in code, shown in the UI
    acknowledged: { type: Boolean, default: false },
    clearedAt: { type: Date, default: null }, // overconcentration only: set when the position fell back under 35%
    ruleVersion: { type: Number }, // rules that produced it; older events are re-checked at start-up
  },
  // bufferCommands off: if MongoDB is down, detection fails (and is skipped) at once instead of hanging 10s.
  { timestamps: true, collection: "behavioral_events", bufferCommands: false }
);
behaviorEventSchema.index({ userId: 1, createdAt: -1 });
behaviorEventSchema.index({ userId: 1, patternType: 1, symbol: 1, createdAt: -1 });

module.exports = mongoose.models.BehaviorEvent || mongoose.model("BehaviorEvent", behaviorEventSchema);
