import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { aiPurpose } from "./schema";

// ---------------------------------------------------------------------------
// Internal AI bookkeeping. Kept at the top level (not under ai/) so it is easy
// to call from the provider layer via `internal.ai_internal.*`.
// ---------------------------------------------------------------------------

// Rough cost table mirrored from openai.ts for server-side estimation.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4o": { in: 0.005, out: 0.015 },
  "gpt-4.1-mini": { in: 0.0004, out: 0.0016 },
  "gpt-5.4-mini": { in: 0.00075, out: 0.0045 },
};

function estimatedCost(model: string, inputTokens = 0, outputTokens = 0) {
  const p = PRICING[model] ?? { in: 0, out: 0 };
  return (inputTokens / 1000) * p.in + (outputTokens / 1000) * p.out;
}

/** Log a single model call into the `aiUsage` table. */
export const logAiUsage = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    mirrorId: v.optional(v.id("mirrors")),
    provider: v.string(),
    model: v.string(),
    purpose: aiPurpose,
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiUsage", {
      userId: args.userId,
      mirrorId: args.mirrorId,
      provider: args.provider,
      model: args.model,
      purpose: args.purpose,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      estimatedCost: estimatedCost(args.model, args.inputTokens, args.outputTokens),
      createdAt: Date.now(),
    });
  },
});

export const recalculateEstimatedCosts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("aiUsage").collect();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        estimatedCost: estimatedCost(row.model, row.inputTokens, row.outputTokens),
      });
    }
    return { updated: rows.length };
  },
});
