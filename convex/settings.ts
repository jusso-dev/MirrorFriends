import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireUserAndMirror } from "./authz";
import { cascadeDeleteMirror } from "./mirrors";

// ---------------------------------------------------------------------------
// Settings: privacy controls, AI usage estimate, data export, account deletion.
// These implement the user-facing half of the Privacy & Safety requirements.
// ---------------------------------------------------------------------------

/** Pause or resume ALL Mirror activity for the caller (global kill switch). */
export const setMirrorPaused = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { mirrorPaused: args.paused, updatedAt: Date.now() });
    return { paused: args.paused };
  },
});

/** Aggregate AI usage + estimated cost for the caller. Shown in Settings. */
export const getAiUsageEstimate = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("aiUsage")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedCost = 0;
    const byPurpose: Record<string, number> = {};
    for (const r of rows) {
      inputTokens += r.inputTokens ?? 0;
      outputTokens += r.outputTokens ?? 0;
      estimatedCost += r.estimatedCost ?? 0;
      byPurpose[r.purpose] = (byPurpose[r.purpose] ?? 0) + 1;
    }
    return {
      calls: rows.length,
      inputTokens,
      outputTokens,
      estimatedCostUsd: Math.round(estimatedCost * 10000) / 10000,
      byPurpose,
    };
  },
});

/** Export all of the caller's data as a single JSON-able object. */
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_mirror", (q) => q.eq("mirrorId", mirror._id))
      .collect();
    const behaviours = await ctx.db
      .query("mirrorBehaviours")
      .withIndex("by_mirror", (q) => q.eq("mirrorId", mirror._id))
      .collect();
    const assistantMessages = await ctx.db
      .query("mirrorAssistantMessages")
      .withIndex("by_mirror_created", (q) => q.eq("mirrorId", mirror._id))
      .collect();
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return {
      exportedAt: Date.now(),
      user,
      mirror,
      memories,
      behaviours,
      assistantMessages,
      notifications,
    };
  },
});

/**
 * Delete the caller's account and all associated data. Cascades through every
 * table the user owns. Friendships are removed; the friend's view will show the
 * connection as gone. Irreversible.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const mirror = await ctx.db
      .query("mirrors")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
      .unique();

    if (mirror) {
      // Conversations + messages for this user's friendships.
      const asA = await ctx.db
        .query("friendships")
        .withIndex("by_userA", (q) => q.eq("userAId", user._id))
        .collect();
      const asB = await ctx.db
        .query("friendships")
        .withIndex("by_userB", (q) => q.eq("userBId", user._id))
        .collect();
      for (const f of [...asA, ...asB]) {
        const convos = await ctx.db
          .query("mirrorConversations")
          .withIndex("by_friendship", (q) => q.eq("friendshipId", f._id))
          .collect();
        for (const c of convos) {
          const msgs = await ctx.db
            .query("mirrorMessages")
            .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
            .collect();
          for (const m of msgs) await ctx.db.delete(m._id);
          await ctx.db.delete(c._id);
        }
        await ctx.db.delete(f._id);
      }

      // Assistant messages.
      const am = await ctx.db
        .query("mirrorAssistantMessages")
        .withIndex("by_mirror_created", (q) => q.eq("mirrorId", mirror._id))
        .collect();
      for (const m of am) await ctx.db.delete(m._id);

      // Mirror + memories + behaviours.
      await cascadeDeleteMirror(ctx, mirror._id, user._id);
    }

    // Invites, notifications, usage.
    const invites = await ctx.db
      .query("friendInvites")
      .withIndex("by_inviter", (q) => q.eq("inviterUserId", user._id))
      .collect();
    for (const i of invites) await ctx.db.delete(i._id);

    const notifs = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const n of notifs) await ctx.db.delete(n._id);

    const usage = await ctx.db
      .query("aiUsage")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const u of usage) await ctx.db.delete(u._id);

    await ctx.db.delete(user._id);
    return { ok: true };
  },
});
