import { query, mutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireUserAndMirror } from "./authz";
import { Doc, Id } from "./_generated/dataModel";
import { friendGoalStatus } from "./schema";

// ---------------------------------------------------------------------------
// Friend invites + friendships.
//
// Friendships are stored once per pair using a canonical ordering of the two
// user ids (lexicographic). This prevents duplicate rows and makes membership
// lookups simple. Two mirrors can only ever interact through an "active"
// friendship; "paused"/"blocked" suppress all Mirror-to-Mirror activity.
// ---------------------------------------------------------------------------

function generateInviteCode(): string {
  // Human-friendly, unambiguous code (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// Canonically order a pair of users so (A,B) and (B,A) collapse to one row.
function orderPair(
  uX: Id<"users">,
  mX: Id<"mirrors">,
  uY: Id<"users">,
  mY: Id<"mirrors">,
) {
  if (uX < uY) {
    return { userAId: uX, mirrorAId: mX, userBId: uY, mirrorBId: mY };
  }
  return { userAId: uY, mirrorAId: mY, userBId: uX, mirrorBId: mX };
}

async function findFriendship(
  ctx: { db: any },
  u1: Id<"users">,
  u2: Id<"users">,
): Promise<Doc<"friendships"> | null> {
  const [a, b] = u1 < u2 ? [u1, u2] : [u2, u1];
  return await ctx.db
    .query("friendships")
    .withIndex("by_pair", (q: any) => q.eq("userAId", a).eq("userBId", b))
    .unique();
}

async function assertFriendshipMember(
  ctx: { db: any },
  userId: Id<"users">,
  friendshipId: Id<"friendships">,
) {
  const friendship = await ctx.db.get(friendshipId);
  if (!friendship || (friendship.userAId !== userId && friendship.userBId !== userId)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Not your friendship." });
  }
  if (friendship.status === "blocked") {
    throw new ConvexError({ code: "BLOCKED", message: "Friendship is blocked." });
  }
  return friendship;
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function otherUserId(friendship: Doc<"friendships">, userId: Id<"users">): Id<"users"> {
  return friendship.userAId === userId ? friendship.userBId : friendship.userAId;
}

function pendingGoalResponder(
  friendship: Doc<"friendships">,
  goal: Doc<"friendGoals">,
): Id<"users"> {
  return goal.needsResponseFromUserId ?? otherUserId(friendship, goal.createdByUserId);
}

async function notifyGoalPeer(
  ctx: { db: any },
  args: {
    userId: Id<"users">;
    title: string;
    body: string;
    goalId: Id<"friendGoals">;
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: "friend_goal_updated",
    title: args.title,
    body: args.body,
    read: false,
    relatedId: args.goalId,
    createdAt: Date.now(),
  });
}

/**
 * List the caller's friendships, hydrated with the friend's user + Mirror and a
 * lightweight last-conversation summary.
 */
export const listMyFriends = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUserAndMirror(ctx);
    const asA = await ctx.db
      .query("friendships")
      .withIndex("by_userA", (q) => q.eq("userAId", user._id))
      .collect();
    const asB = await ctx.db
      .query("friendships")
      .withIndex("by_userB", (q) => q.eq("userBId", user._id))
      .collect();
    const all = [...asA, ...asB];

    const results = [];
    for (const f of all) {
      if (f.status === "blocked") continue;
      const friendUserId = f.userAId === user._id ? f.userBId : f.userAId;
      const friendMirrorId = f.userAId === user._id ? f.mirrorBId : f.mirrorAId;
      const friendUser = await ctx.db.get(friendUserId);
      const friendMirror = await ctx.db.get(friendMirrorId);
      results.push({
        friendship: f,
        friendUser: friendUser
          ? {
              _id: friendUser._id,
              name: friendUser.name ?? friendUser.nickname ?? "Friend",
              nickname: friendUser.nickname,
            }
          : null,
        friendMirror: friendMirror
          ? {
              _id: friendMirror._id,
              name: friendMirror.name,
              avatarEmoji: friendMirror.avatarEmoji,
            }
          : null,
      });
    }
    results.sort(
      (a, b) =>
        (b.friendship.lastConversationAt ?? b.friendship.createdAt) -
        (a.friendship.lastConversationAt ?? a.friendship.createdAt),
    );
    return results;
  },
});

export const listFriendGoals = query({
  args: { friendshipId: v.optional(v.id("friendships")) },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    const friendships = args.friendshipId
      ? [await assertFriendshipMember(ctx, user._id, args.friendshipId)]
      : [
          ...(await ctx.db
            .query("friendships")
            .withIndex("by_userA", (q) => q.eq("userAId", user._id))
            .collect()),
          ...(await ctx.db
            .query("friendships")
            .withIndex("by_userB", (q) => q.eq("userBId", user._id))
            .collect()),
        ].filter((f) => f.status !== "blocked");

    const rows = [];
    for (const friendship of friendships) {
      if (!friendship) continue;
      const friendMirrorId =
        friendship.mirrorAId === mirror._id ? friendship.mirrorBId : friendship.mirrorAId;
      const friendMirror = await ctx.db.get(friendMirrorId);
      const goals = await ctx.db
        .query("friendGoals")
        .withIndex("by_friendship_created", (q) =>
          q.eq("friendshipId", friendship._id),
        )
        .order("desc")
        .collect();
      for (const goal of goals) {
        const responseUserId = pendingGoalResponder(friendship, goal);
        rows.push({
          goal,
          friendshipId: friendship._id,
          friendMirrorName: friendMirror?.name ?? "Friend's Mirror",
          friendMirrorEmoji: friendMirror?.avatarEmoji,
          createdByCurrentUser: goal.createdByUserId === user._id,
          updatedByCurrentUser: goal.updatedByUserId === user._id,
          needsResponseFromCurrentUser:
            goal.status === "proposed" && responseUserId === user._id,
        });
      }
    }
    rows.sort((a, b) => b.goal.updatedAt - a.goal.updatedAt);
    return rows;
  },
});

export const createFriendGoal = mutation({
  args: {
    friendshipId: v.id("friendships"),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const friendship = await assertFriendshipMember(ctx, user._id, args.friendshipId);
    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Goal title is required." });
    }
    const recipientUserId = otherUserId(friendship, user._id);
    const now = Date.now();
    const goalId = await ctx.db.insert("friendGoals", {
      friendshipId: args.friendshipId,
      createdByUserId: user._id,
      needsResponseFromUserId: recipientUserId,
      updatedByUserId: user._id,
      title,
      description: optionalText(args.description),
      status: "proposed",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notifications", {
      userId: recipientUserId,
      type: "friend_goal_proposed",
      title: "Shared goal proposed",
      body: `${user.nickname ?? user.name ?? "A friend"} proposed: ${title}`,
      read: false,
      relatedId: goalId,
      createdAt: now,
    });
    return goalId;
  },
});

export const updateFriendGoal = mutation({
  args: {
    goalId: v.id("friendGoals"),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Goal not found." });
    }
    const friendship = await assertFriendshipMember(ctx, user._id, goal.friendshipId);
    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({ code: "INVALID_GOAL", message: "Goal title is required." });
    }
    const recipientUserId = otherUserId(friendship, user._id);
    const now = Date.now();
    await ctx.db.patch(args.goalId, {
      title,
      description: optionalText(args.description),
      status: "proposed",
      needsResponseFromUserId: recipientUserId,
      respondedByUserId: undefined,
      updatedByUserId: user._id,
      agreedAt: undefined,
      declinedAt: undefined,
      completedAt: undefined,
      updatedAt: now,
    });
    await notifyGoalPeer(ctx, {
      userId: recipientUserId,
      title: "Shared goal updated",
      body: `${user.nickname ?? user.name ?? "A friend"} updated a shared goal: ${title}`,
      goalId: args.goalId,
    });
    return { ok: true, status: "proposed" as const };
  },
});

export const updateFriendGoalStatus = mutation({
  args: {
    goalId: v.id("friendGoals"),
    status: friendGoalStatus,
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const goal = await ctx.db.get(args.goalId);
    if (!goal) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Goal not found." });
    }
    const friendship = await assertFriendshipMember(ctx, user._id, goal.friendshipId);
    const now = Date.now();

    if (args.status === "agreed" || args.status === "declined") {
      if (goal.status !== "proposed") {
        throw new ConvexError({
          code: "INVALID_TRANSITION",
          message: "Only proposed goals can be agreed or rejected.",
        });
      }
      const responderId = pendingGoalResponder(friendship, goal);
      if (responderId !== user._id) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "The other friend needs to respond to this proposal.",
        });
      }
      await ctx.db.patch(args.goalId, {
        status: args.status,
        respondedByUserId: user._id,
        updatedByUserId: user._id,
        needsResponseFromUserId: undefined,
        agreedAt: args.status === "agreed" ? now : undefined,
        declinedAt: args.status === "declined" ? now : undefined,
        completedAt: undefined,
        updatedAt: now,
      });
      await notifyGoalPeer(ctx, {
        userId: otherUserId(friendship, user._id),
        title: args.status === "agreed" ? "Shared goal agreed" : "Shared goal rejected",
        body: `${user.nickname ?? user.name ?? "A friend"} ${args.status === "agreed" ? "agreed to" : "rejected"}: ${goal.title}`,
        goalId: args.goalId,
      });
      return { ok: true, status: args.status };
    }

    if (args.status === "in_progress") {
      if (goal.status !== "agreed" && goal.status !== "in_progress") {
        throw new ConvexError({
          code: "INVALID_TRANSITION",
          message: "Only agreed goals can be started.",
        });
      }
      await ctx.db.patch(args.goalId, {
        status: "in_progress",
        updatedByUserId: user._id,
        updatedAt: now,
      });
      return { ok: true, status: "in_progress" };
    }

    if (args.status === "done") {
      if (
        goal.status !== "agreed" &&
        goal.status !== "in_progress" &&
        goal.status !== "done"
      ) {
        throw new ConvexError({
          code: "INVALID_TRANSITION",
          message: "Only agreed or active goals can be completed.",
        });
      }
      await ctx.db.patch(args.goalId, {
        status: "done",
        completedAt: goal.completedAt ?? now,
        updatedByUserId: user._id,
        updatedAt: now,
      });
      await notifyGoalPeer(ctx, {
        userId: otherUserId(friendship, user._id),
        title: "Shared goal completed",
        body: `${user.nickname ?? user.name ?? "A friend"} marked complete: ${goal.title}`,
        goalId: args.goalId,
      });
      return { ok: true, status: "done" };
    }

    if (args.status === "proposed") {
      const recipientUserId = otherUserId(friendship, user._id);
      await ctx.db.patch(args.goalId, {
        status: "proposed",
        needsResponseFromUserId: recipientUserId,
        respondedByUserId: undefined,
        updatedByUserId: user._id,
        agreedAt: undefined,
        declinedAt: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
      return { ok: true, status: "proposed" };
    }

    return { ok: true, status: args.status };
  },
});

/**
 * Create a fresh invite code owned by the caller. Codes expire in 30 days.
 */
export const createFriendInvite = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    // Generate a code, retrying on the rare collision.
    let code = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      const clash = await ctx.db
        .query("friendInvites")
        .withIndex("by_code", (q) => q.eq("inviteCode", code))
        .unique();
      if (!clash) break;
      code = generateInviteCode();
    }
    const now = Date.now();
    await ctx.db.insert("friendInvites", {
      inviterUserId: user._id,
      inviterMirrorId: mirror._id,
      inviteCode: code,
      expiresAt: now + 1000 * 60 * 60 * 24 * 30,
      createdAt: now,
    });
    return { inviteCode: code };
  },
});

/**
 * Accept an invite code, creating an active friendship between the inviter and
 * the caller. Idempotent: re-accepting an existing pair just returns it.
 */
export const acceptFriendInvite = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    const code = args.inviteCode.trim().toUpperCase();
    const invite = await ctx.db
      .query("friendInvites")
      .withIndex("by_code", (q) => q.eq("inviteCode", code))
      .unique();
    if (!invite) {
      throw new ConvexError({ code: "INVALID_CODE", message: "Invite code not found." });
    }
    if (invite.expiresAt && invite.expiresAt < Date.now()) {
      throw new ConvexError({ code: "EXPIRED", message: "This invite has expired." });
    }
    if (invite.inviterUserId === user._id) {
      throw new ConvexError({
        code: "SELF_INVITE",
        message: "You can't accept your own invite.",
      });
    }

    const existing = await findFriendship(ctx, user._id, invite.inviterUserId);
    if (existing) {
      // Reactivate if it was paused; surface the existing friendship.
      if (existing.status === "paused" || existing.status === "pending") {
        await ctx.db.patch(existing._id, { status: "active" });
      }
      return { friendshipId: existing._id, alreadyFriends: true };
    }

    const ordered = orderPair(
      user._id,
      mirror._id,
      invite.inviterUserId,
      invite.inviterMirrorId,
    );
    const now = Date.now();
    const friendshipId = await ctx.db.insert("friendships", {
      ...ordered,
      status: "active",
      createdAt: now,
    });

    await ctx.db.patch(invite._id, {
      claimedByUserId: user._id,
      claimedAt: now,
    });

    // Notify the inviter that a friend joined.
    await ctx.db.insert("notifications", {
      userId: invite.inviterUserId,
      type: "friend_joined",
      title: "New Mirror connection",
      body: `${user.nickname ?? user.name ?? "Someone"} connected their Mirror with yours.`,
      read: false,
      relatedId: friendshipId,
      createdAt: now,
    });

    return { friendshipId, alreadyFriends: false };
  },
});

/**
 * Pause or resume Mirror-to-Mirror conversations for a friendship. Either party
 * may pause; resuming returns it to active.
 */
export const pauseFriendship = mutation({
  args: { friendshipId: v.id("friendships"), paused: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const f = await ctx.db.get(args.friendshipId);
    if (!f || (f.userAId !== user._id && f.userBId !== user._id)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your friendship." });
    }
    if (f.status === "blocked") {
      throw new ConvexError({ code: "BLOCKED", message: "Friendship is blocked." });
    }
    const paused = args.paused ?? true;
    await ctx.db.patch(args.friendshipId, { status: paused ? "paused" : "active" });
    return { status: paused ? "paused" : "active" };
  },
});

/** Remove a friendship from both users' visible connection lists. */
export const removeFriendship = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const f = await ctx.db.get(args.friendshipId);
    if (!f || (f.userAId !== user._id && f.userBId !== user._id)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your friendship." });
    }
    await ctx.db.patch(args.friendshipId, { status: "blocked" });
    return { ok: true, status: "blocked" };
  },
});

// ---------------------------------------------------------------------------
// Internal accessors for crons / tools.
// ---------------------------------------------------------------------------

/** All active friendships (used by scheduler and tools). */
export const listActiveFriendships = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("friendships")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

/**
 * Active friendships where NEITHER owner has globally paused their Mirror. This
 * is the authoritative set the scheduler may generate conversations for.
 */
export const listActiveFriendshipsForCron = internalQuery({
  args: {},
  handler: async (ctx) => {
    const friendships = await ctx.db
      .query("friendships")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const pauseCache = new Map<string, boolean>();
    const isPaused = async (uid: Id<"users">) => {
      const cached = pauseCache.get(uid);
      if (cached !== undefined) return cached;
      const u = await ctx.db.get(uid);
      const paused = u?.mirrorPaused ?? true; // missing user -> treat as paused
      pauseCache.set(uid, paused);
      return paused;
    };
    const out: Doc<"friendships">[] = [];
    for (const f of friendships) {
      if ((await isPaused(f.userAId)) || (await isPaused(f.userBId))) continue;
      out.push(f);
    }
    return out;
  },
});

/** All non-paused users that own a Mirror (used by the weekly summary cron). */
export const listActiveMirrorOwners = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => u.onboardingComplete && !u.mirrorPaused)
      .map((u) => u._id);
  },
});

/**
 * Friendship context for the tool system: returns the friendship plus both
 * Mirrors' names and the SHAREABLE profile of the *other* Mirror only.
 */
export const getFriendshipContext = internalQuery({
  args: { friendshipId: v.id("friendships"), forMirrorId: v.id("mirrors") },
  handler: async (ctx, args) => {
    const f = await ctx.db.get(args.friendshipId);
    if (!f) throw new ConvexError({ code: "NOT_FOUND", message: "No friendship." });
    const isA = f.mirrorAId === args.forMirrorId;
    const selfMirrorId = isA ? f.mirrorAId : f.mirrorBId;
    const otherMirrorId = isA ? f.mirrorBId : f.mirrorAId;
    const selfMirror = await ctx.db.get(selfMirrorId);
    const otherMirror = await ctx.db.get(otherMirrorId);
    return {
      friendship: f,
      selfMirror: selfMirror && {
        _id: selfMirror._id,
        name: selfMirror.name,
      },
      otherMirror: otherMirror && {
        _id: otherMirror._id,
        name: otherMirror.name,
        // Only the safe summary is ever exposed across the boundary.
        shareableProfile: otherMirror.shareableProfile ?? "",
        interests: otherMirror.interests,
      },
    };
  },
});
