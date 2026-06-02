import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Feature flags. A tiny key/value table that lets us gate future features
// (group chats, voice, etc.) without redeploying the client. Read-only to the
// app; writes happen via internal mutation / dashboard.
// ---------------------------------------------------------------------------

export const getFlags = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("featureFlags").collect();
    const map: Record<string, { enabled: boolean; value?: string }> = {};
    for (const r of rows) map[r.key] = { enabled: r.enabled, value: r.value };
    return map;
  },
});

export const setFlag = internalMutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    value: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        value: args.value,
        description: args.description,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("featureFlags", {
      key: args.key,
      enabled: args.enabled,
      value: args.value,
      description: args.description,
      updatedAt: Date.now(),
    });
  },
});
