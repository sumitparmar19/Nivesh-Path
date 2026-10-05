// One saved AI portfolio analysis per run, so the user can reopen past answers ("Past analyses" on the Advisor).
const mongoose = require("mongoose");

const analysisSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    question: { type: String, maxlength: 1000 },
    riskProfile: { type: String, enum: ["conservative", "moderate", "aggressive"], default: "moderate" },
    holdings: { type: Array, default: [] },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
analysisSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Analysis || mongoose.model("Analysis", analysisSchema);
