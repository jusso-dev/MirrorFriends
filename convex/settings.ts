import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAdmin, requireUser, requireUserAndMirror } from "./authz";
import { cascadeDeleteMirror } from "./mirrors";
import {
  AGENT_SCHEDULE_KEY,
  normaliseAgentSchedule,
  serialiseAgentSchedule,
} from "./agent_schedule";

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

/** Show the current app-wide Mirror-to-Mirror communication schedule. */
export const getAgentSchedule = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const row = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", AGENT_SCHEDULE_KEY))
      .unique();
    return normaliseAgentSchedule(row?.value);
  },
});

/** Admin-only: update the times when scheduled Mirror chats may run. */
export const updateAgentSchedule = mutation({
  args: {
    enabled: v.boolean(),
    timezone: v.string(),
    times: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let value: string;
    try {
      value = serialiseAgentSchedule(args);
    } catch (error) {
      throw new ConvexError({
        code: "INVALID_SCHEDULE",
        message: error instanceof Error ? error.message : "Invalid schedule.",
      });
    }

    const schedule = normaliseAgentSchedule(value);
    if (schedule.enabled && schedule.times.length === 0) {
      throw new ConvexError({
        code: "INVALID_SCHEDULE",
        message: "Add at least one communication time.",
      });
    }

    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", AGENT_SCHEDULE_KEY))
      .unique();
    const patch = {
      key: AGENT_SCHEDULE_KEY,
      enabled: schedule.enabled,
      value,
      description: "App-wide Mirror-to-Mirror communication schedule.",
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("featureFlags", patch);
    }
    return schedule;
  },
});

export const getAgentScheduleForCron = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", AGENT_SCHEDULE_KEY))
      .unique();
    return normaliseAgentSchedule(row?.value);
  },
});

export const claimAgentChatWindowBudget = internalMutation({
  args: {
    friendshipId: v.id("friendships"),
    localDate: v.string(),
    slot: v.string(),
    source: v.union(v.literal("scheduled"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.localDate)) {
      throw new ConvexError({
        code: "INVALID_DATE",
        message: "Budget date must use YYYY-MM-DD format.",
      });
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(args.slot) && args.slot !== "manual") {
      throw new ConvexError({
        code: "INVALID_SLOT",
        message: "Budget slot must use HH:mm format.",
      });
    }

    const key = `agent_chat_window:${args.friendshipId}:${args.localDate}:${args.slot}`;
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) return { claimed: false };

    await ctx.db.insert("featureFlags", {
      key,
      enabled: true,
      value: JSON.stringify({ source: args.source, slot: args.slot, claimedAt: Date.now() }),
      description: "Four-message Mirror chat window budget claim.",
      updatedAt: Date.now(),
    });
    return { claimed: true };
  },
});

export const releaseAgentChatWindowBudget = internalMutation({
  args: {
    friendshipId: v.id("friendships"),
    localDate: v.string(),
    slot: v.string(),
  },
  handler: async (ctx, args) => {
    const key = `agent_chat_window:${args.friendshipId}:${args.localDate}:${args.slot}`;
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!existing) return { released: false };
    await ctx.db.delete(existing._id);
    return { released: true };
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
