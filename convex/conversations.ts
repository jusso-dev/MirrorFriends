import {
  query,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireUserAndMirror } from "./authz";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  buildConversationPrompt,
  buildAskMyMirrorPrompt,
  buildWeeklySummaryPrompt,
  MirrorSideContext,
} from "./ai/prompts";

// ---------------------------------------------------------------------------
// Mirror conversations: viewing, daily generation, Ask My Mirror, weekly summary.
// ---------------------------------------------------------------------------

const MIN_MESSAGES = 4;
const MAX_MESSAGES = 8;

// ===========================================================================
// QUERIES (user-facing)
// ===========================================================================

/**
 * List Mirror-to-Mirror conversations that involve the caller's Mirror, newest
 * first, hydrated with the friend's name.
 */
export const listMirrorConversations = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);

    // Gather the caller's friendships.
    const asA = await ctx.db
      .query("friendships")
      .withIndex("by_userA", (q) => q.eq("userAId", user._id))
      .collect();
    const asB = await ctx.db
      .query("friendships")
      .withIndex("by_userB", (q) => q.eq("userBId", user._id))
      .collect();
    const friendships = [...asA, ...asB];

    const out: any[] = [];
    for (const f of friendships) {
      const convos = await ctx.db
        .query("mirrorConversations")
        .withIndex("by_friendship_created", (q) => q.eq("friendshipId", f._id))
        .order("desc")
        .collect();
      const friendMirrorId = f.mirrorAId === mirror._id ? f.mirrorBId : f.mirrorAId;
      const friendMirror = await ctx.db.get(friendMirrorId);
      for (const c of convos) {
        out.push({
          conversation: c,
          friendshipId: f._id,
          friendMirrorName: friendMirror?.name ?? "Friend's Mirror",
          friendMirrorEmoji: friendMirror?.avatarEmoji,
        });
      }
    }
    out.sort((a, b) => b.conversation.createdAt - a.conversation.createdAt);
    return args.limit ? out.slice(0, args.limit) : out;
  },
});

/**
 * List the messages of a single conversation. Enforces that the caller's Mirror
 * is a participant in the underlying friendship.
 */
export const listConversationMessages = query({
  args: { conversationId: v.id("mirrorConversations") },
  handler: async (ctx, args) => {
    const { mirror } = await requireUserAndMirror(ctx);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new ConvexError({ code: "NOT_FOUND", message: "No conversation." });
    const f = await ctx.db.get(convo.friendshipId);
    if (!f || (f.mirrorAId !== mirror._id && f.mirrorBId !== mirror._id)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your conversation." });
    }
    const messages = await ctx.db
      .query("mirrorMessages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
    return { conversation: convo, messages };
  },
});

// ===========================================================================
// INTERNAL ACCESSORS (used by tools + generation pipeline)
// ===========================================================================

/** Recent messages for a friendship's latest conversation, oldest-first. */
export const getRecentMessagesForFriendship = internalQuery({
  args: { friendshipId: v.id("friendships"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const convos = await ctx.db
      .query("mirrorConversations")
      .withIndex("by_friendship_created", (q) =>
        q.eq("friendshipId", args.friendshipId),
      )
      .order("desc")
      .take(3);
    const out: { speaker: string; content: string }[] = [];
    const mirrorNameCache = new Map<string, string>();
    for (const c of convos.reverse()) {
      const msgs = await ctx.db
        .query("mirrorMessages")
        .withIndex("by_conversation_created", (q) => q.eq("conversationId", c._id))
        .order("asc")
        .collect();
      for (const m of msgs) {
        let name = mirrorNameCache.get(m.senderMirrorId);
        if (!name) {
          const mir = await ctx.db.get(m.senderMirrorId);
          name = mir?.name ?? "Mirror";
          mirrorNameCache.set(m.senderMirrorId, name);
        }
        out.push({ speaker: name, content: m.content });
      }
    }
    const limit = args.limit ?? 10;
    return out.slice(-limit);
  },
});

/**
 * Build the full side-context for one Mirror in a friendship: profile, active
 * behaviour, and SHAREABLE highlights only. This is the data that may inform a
 * Mirror-to-Mirror conversation.
 */
export const getMirrorSideContext = internalQuery({
  args: { mirrorId: v.id("mirrors") },
  handler: async (ctx, { mirrorId }): Promise<MirrorSideContext | null> => {
    const mirror = await ctx.db.get(mirrorId);
    if (!mirror) return null;
    const owner = await ctx.db.get(mirror.ownerUserId);
    const behaviour = await ctx.db
      .query("mirrorBehaviours")
      .withIndex("by_mirror_active", (q) =>
        q.eq("mirrorId", mirrorId).eq("active", true),
      )
      .unique();

    const shareable = await ctx.db
      .query("memories")
      .withIndex("by_mirror_visibility", (q) =>
        q.eq("mirrorId", mirrorId).eq("visibility", "shareable").eq("archived", false),
      )
      .order("desc")
      .take(12);

    return {
      mirrorName: mirror.name,
      ownerDisplayName: owner?.nickname ?? owner?.name ?? "their owner",
      systemPrompt:
        behaviour?.systemPrompt ??
        `You are ${mirror.name}, an AI Mirror that represents your owner in the third person.`,
      communicationRules: behaviour?.communicationRules ?? ["Be concise and warm."],
      privacyRules: behaviour?.privacyRules ?? [
        "Never reveal private memory.",
        "Never make commitments on the human's behalf.",
      ],
      shareableProfile: mirror.shareableProfile ?? "",
      interests: mirror.interests,
      shareableHighlights: shareable.map((m) => m.content),
    };
  },
});

/** Resolve both Mirrors + owners for a friendship and verify it is active. */
export const getFriendshipForGeneration = internalQuery({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, { friendshipId }) => {
    const f = await ctx.db.get(friendshipId);
    if (!f) return null;
    return f;
  },
});

export const createPendingConversation = internalMutation({
  args: {
    friendshipId: v.id("friendships"),
    type: v.union(v.literal("daily"), v.literal("manual"), v.literal("weekly_summary")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("mirrorConversations", {
      friendshipId: args.friendshipId,
      type: args.type,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const appendMirrorMessage = internalMutation({
  args: {
    conversationId: v.id("mirrorConversations"),
    senderMirrorId: v.id("mirrors"),
    receiverMirrorId: v.id("mirrors"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("mirrorMessages", {
      conversationId: args.conversationId,
      senderMirrorId: args.senderMirrorId,
      receiverMirrorId: args.receiverMirrorId,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});

export const finalizeConversation = internalMutation({
  args: {
    conversationId: v.id("mirrorConversations"),
    status: v.union(v.literal("complete"), v.literal("failed")),
    summary: v.optional(v.string()),
    notify: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) return;
    await ctx.db.patch(args.conversationId, {
      status: args.status,
      summary: args.summary,
    });
    const f = await ctx.db.get(convo.friendshipId);
    if (!f) return;
    if (args.status === "complete") {
      await ctx.db.patch(f._id, { lastConversationAt: Date.now() });
    }
    if (args.notify && args.status === "complete") {
      const now = Date.now();
      for (const uid of [f.userAId, f.userBId]) {
        await ctx.db.insert("notifications", {
          userId: uid,
          type: "daily_conversation_ready",
          title: "Your Mirrors just chatted",
          body: args.summary ?? "A new Mirror conversation is ready to read.",
          read: false,
          relatedId: args.conversationId,
          createdAt: now,
        });
      }
    }
  },
});

// ===========================================================================
// ACTION: Daily Mirror-to-Mirror conversation
// ===========================================================================

/**
 * Generate one short Mirror-to-Mirror conversation for a friendship. Assumes a
 * pending conversation has already been created by the cron (or creates one if
 * `conversationId` is omitted, for manual triggering).
 */
export const generateDailyMirrorConversation = internalAction({
  args: {
    friendshipId: v.id("friendships"),
    conversationId: v.optional(v.id("mirrorConversations")),
    notify: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ conversationId: Id<"mirrorConversations"> }> => {
    const friendship = await ctx.runQuery(
      internal.conversations.getFriendshipForGeneration,
      { friendshipId: args.friendshipId },
    );
    if (!friendship || friendship.status !== "active") {
      throw new ConvexError({
        code: "INACTIVE",
        message: "Friendship is not active.",
      });
    }

    const conversationId =
      args.conversationId ??
      (await ctx.runMutation(internal.conversations.createPendingConversation, {
        friendshipId: args.friendshipId,
        type: "daily",
      }));

    try {
      const sideA = await ctx.runQuery(internal.conversations.getMirrorSideContext, {
        mirrorId: friendship.mirrorAId,
      });
      const sideB = await ctx.runQuery(internal.conversations.getMirrorSideContext, {
        mirrorId: friendship.mirrorBId,
      });
      if (!sideA || !sideB) {
        throw new Error("Missing Mirror context.");
      }

      const { provider } = await import("./ai/provider");

      // Alternate speakers, A opens. Pick an even count in [MIN, MAX].
      const total =
        MIN_MESSAGES +
        2 * Math.floor((Math.random() * (MAX_MESSAGES - MIN_MESSAGES + 1)) / 2);
      const sides = [
        { ctx: sideA, mirrorId: friendship.mirrorAId, other: sideB, otherMirrorId: friendship.mirrorBId },
        { ctx: sideB, mirrorId: friendship.mirrorBId, other: sideA, otherMirrorId: friendship.mirrorAId },
      ];

      const history: { speaker: string; content: string }[] = [];
      for (let i = 0; i < total; i++) {
        const s = sides[i % 2];
        const prompt = buildConversationPrompt({
          side: s.ctx,
          other: {
            mirrorName: s.other.mirrorName,
            shareableProfile: s.other.shareableProfile,
            interests: s.other.interests,
          },
          recentHistory: history,
          totalMessages: total,
        });
        const result = await provider.generateText({
          system: prompt.system,
          prompt: prompt.user,
          purpose: "daily_conversation",
          mirrorId: s.mirrorId,
          temperature: 0.85,
          maxTokens: 160,
          ctx,
        });
        const content = result.text.trim().replace(/^["']|["']$/g, "");
        if (!content) continue;
        await ctx.runMutation(internal.conversations.appendMirrorMessage, {
          conversationId,
          senderMirrorId: s.mirrorId,
          receiverMirrorId: s.otherMirrorId,
          content,
        });
        history.push({ speaker: s.ctx.mirrorName, content });
      }

      const summary =
        history.length > 0
          ? `${history[0].speaker} and ${sides[1].ctx.mirrorName} talked about ${
              sideA.interests[0] ?? "shared interests"
            }.`
          : "The Mirrors had a brief chat.";

      await ctx.runMutation(internal.conversations.finalizeConversation, {
        conversationId,
        status: "complete",
        summary,
        notify: args.notify ?? true,
      });
    } catch (err) {
      console.error("Daily conversation generation failed:", err);
      await ctx.runMutation(internal.conversations.finalizeConversation, {
        conversationId,
        status: "failed",
      });
      throw err;
    }

    return { conversationId };
  },
});

/**
 * Manually trigger a Mirror-to-Mirror conversation for one of the caller's
 * friendships (e.g. a "chat now" button, and useful for testing the pipeline
 * without waiting for the cron). Validates membership + active status.
 */
export const generateConversationNow = action({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args): Promise<{ conversationId: Id<"mirrorConversations"> }> => {
    await ctx.runQuery(internal.conversations.assertMemberAndActive, {
      friendshipId: args.friendshipId,
    });
    return await ctx.runAction(
      internal.conversations.generateDailyMirrorConversation,
      { friendshipId: args.friendshipId, notify: true },
    );
  },
});

/** Internal: verify the caller belongs to an active friendship. */
export const assertMemberAndActive = internalQuery({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, { friendshipId }) => {
    const { user } = await requireUserAndMirror(ctx);
    const f = await ctx.db.get(friendshipId);
    if (!f || (f.userAId !== user._id && f.userBId !== user._id)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your friendship." });
    }
    if (f.status !== "active") {
      throw new ConvexError({ code: "INACTIVE", message: "Friendship is not active." });
    }
    return { ok: true };
  },
});

// ===========================================================================
// ACTION: Ask My Mirror
// ===========================================================================

/** Internal: bundle everything needed to answer an owner's question. */
export const getAskMyMirrorContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    if (user.mirrorPaused) {
      throw new ConvexError({ code: "PAUSED", message: "Your Mirror is paused." });
    }
    const behaviour = await ctx.db
      .query("mirrorBehaviours")
      .withIndex("by_mirror_active", (q) =>
        q.eq("mirrorId", mirror._id).eq("active", true),
      )
      .unique();
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_mirror", (q) => q.eq("mirrorId", mirror._id))
      .filter((q) => q.eq(q.field("archived"), false))
      .collect();

    // Recent assistant chat history (last few turns) for continuity.
    const recentChat = await ctx.db
      .query("mirrorAssistantMessages")
      .withIndex("by_mirror_created", (q) => q.eq("mirrorId", mirror._id))
      .order("desc")
      .take(8);

    return {
      userId: user._id,
      mirrorId: mirror._id,
      ownerDisplayName: user.nickname ?? user.name ?? "you",
      mirror,
      systemPrompt: behaviour?.systemPrompt ?? `You are ${mirror.name}.`,
      communicationRules: behaviour?.communicationRules ?? ["Be concise and helpful."],
      privateMemories: memories.filter((m) => m.visibility === "private"),
      shareableMemories: memories.filter((m) => m.visibility === "shareable"),
      goals: memories.filter((m) => m.type === "goal").map((m) => m.content),
      recentChat: recentChat.reverse().map((m) => ({ role: m.role, content: m.content })),
    };
  },
});

/** Internal: digest of recent Mirror activity across the owner's friendships. */
export const getRecentActivityForOwner = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const asA = await ctx.db
      .query("friendships")
      .withIndex("by_userA", (q) => q.eq("userAId", userId))
      .collect();
    const asB = await ctx.db
      .query("friendships")
      .withIndex("by_userB", (q) => q.eq("userBId", userId))
      .collect();
    const friendships = [...asA, ...asB];
    const out: string[] = [];
    for (const f of friendships) {
      const convos = await ctx.db
        .query("mirrorConversations")
        .withIndex("by_friendship_created", (q) => q.eq("friendshipId", f._id))
        .order("desc")
        .take(2);
      for (const c of convos) {
        if (c.summary) out.push(c.summary);
      }
    }
    return out.slice(0, 10);
  },
});

export const saveAssistantMessage = internalMutation({
  args: {
    userId: v.id("users"),
    mirrorId: v.id("mirrors"),
    role: v.union(v.literal("user"), v.literal("mirror")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("mirrorAssistantMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Ask the caller's own Mirror a question. This is the ONLY action where private
 * memory is used in prompt construction (the Mirror is talking to its owner).
 */
export const askMyMirror = action({
  args: { question: v.string() },
  handler: async (ctx, args): Promise<{ answer: string }> => {
    const c = await ctx.runQuery(internal.conversations.getAskMyMirrorContext, {});
    const recentActivity = await ctx.runQuery(
      internal.conversations.getRecentActivityForOwner,
      { userId: c.userId },
    );

    // Persist the user's question.
    await ctx.runMutation(internal.conversations.saveAssistantMessage, {
      userId: c.userId,
      mirrorId: c.mirrorId,
      role: "user",
      content: args.question,
    });

    const prompt = buildAskMyMirrorPrompt({
      mirror: c.mirror,
      systemPrompt: c.systemPrompt,
      communicationRules: c.communicationRules,
      ownerDisplayName: c.ownerDisplayName,
      privateMemories: c.privateMemories,
      shareableMemories: c.shareableMemories,
      goals: c.goals,
      recentActivity,
      question: args.question,
    });

    const { provider } = await import("./ai/provider");
    let answer: string;
    try {
      const result = await provider.generateText({
        system: prompt.system,
        prompt: prompt.user,
        messages: c.recentChat.map((m) => ({
          role: m.role === "mirror" ? "assistant" : "user",
          content: m.content,
        })),
        purpose: "manual_prompt",
        userId: c.userId,
        mirrorId: c.mirrorId,
        maxTokens: 500,
        ctx,
      });
      answer = result.text.trim();
    } catch (err) {
      console.error("askMyMirror failed:", err);
      answer =
        "I couldn't reach my thoughts just now (the AI service may be unavailable). " +
        "Please try again shortly.";
    }

    await ctx.runMutation(internal.conversations.saveAssistantMessage, {
      userId: c.userId,
      mirrorId: c.mirrorId,
      role: "mirror",
      content: answer,
    });

    return { answer };
  },
});

/** History for the Ask My Mirror screen. */
export const listAssistantMessages = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { mirror } = await requireUserAndMirror(ctx);
    const rows = await ctx.db
      .query("mirrorAssistantMessages")
      .withIndex("by_mirror_created", (q) => q.eq("mirrorId", mirror._id))
      .order("desc")
      .take(args.limit ?? 50);
    return rows.reverse();
  },
});

// ===========================================================================
// ACTION: Weekly summary
// ===========================================================================

/** Internal: conversation digests from the last 7 days for a user. */
export const getWeeklyDigestForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    const mirror = user
      ? await ctx.db
          .query("mirrors")
          .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
          .unique()
      : null;
    if (!user || !mirror) return null;

    const weekAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
    const asA = await ctx.db
      .query("friendships")
      .withIndex("by_userA", (q) => q.eq("userAId", userId))
      .collect();
    const asB = await ctx.db
      .query("friendships")
      .withIndex("by_userB", (q) => q.eq("userBId", userId))
      .collect();
    const friendships = [...asA, ...asB];
    const digests: string[] = [];
    for (const f of friendships) {
      const convos = await ctx.db
        .query("mirrorConversations")
        .withIndex("by_friendship_created", (q) => q.eq("friendshipId", f._id))
        .order("desc")
        .take(7);
      for (const c of convos) {
        if (c.createdAt >= weekAgo && c.summary) digests.push(c.summary);
      }
    }
    return {
      ownerDisplayName: user.nickname ?? user.name ?? "you",
      mirrorName: mirror.name,
      mirrorId: mirror._id,
      digests,
    };
  },
});

export const saveWeeklySummaryNotification = internalMutation({
  args: { userId: v.id("users"), body: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "weekly_summary_ready",
      title: "Your weekly Mirror digest",
      body: args.body,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const generateWeeklySummary = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<void> => {
    const data = await ctx.runQuery(internal.conversations.getWeeklyDigestForUser, {
      userId,
    });
    if (!data || data.digests.length === 0) return;

    const prompt = buildWeeklySummaryPrompt({
      ownerDisplayName: data.ownerDisplayName,
      mirrorName: data.mirrorName,
      conversationDigests: data.digests,
    });

    const { provider } = await import("./ai/provider");
    let body: string;
    try {
      const result = await provider.generateText({
        system: prompt.system,
        prompt: prompt.user,
        purpose: "weekly_summary",
        userId,
        mirrorId: data.mirrorId,
        maxTokens: 400,
        ctx,
      });
      body = result.text.trim();
    } catch (err) {
      console.error("weekly summary failed:", err);
      body = `This week your Mirror had ${data.digests.length} conversation(s) with friends.`;
    }

    await ctx.runMutation(internal.conversations.saveWeeklySummaryNotification, {
      userId,
      body,
    });
  },
});
