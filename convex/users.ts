import { query, mutation, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getCurrentUserOrNull, requireUser } from "./auth";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Users + onboarding.
// ---------------------------------------------------------------------------

/**
 * Returns the current user along with their Mirror (if any). The mobile app
 * calls this on launch to decide whether to show auth, onboarding, or home.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    const mirror = await ctx.db
      .query("mirrors")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
      .unique();
    return { user, mirror: mirror ?? null };
  },
});

/**
 * Idempotently provision a `users` row for the authenticated identity. Safe to
 * call on every app launch. Returns the user row.
 *
 * This is the single entry point that maps an external auth subject to our
 * internal user. It does NOT complete onboarding or create a Mirror.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "You must be signed in.",
      });
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (existing) {
      // Keep email/name fresh from the identity provider.
      const patch: Partial<Doc<"users">> = {};
      if (identity.email && identity.email !== existing.email) {
        patch.email = identity.email;
      }
      if (identity.name && !existing.name) {
        patch.name = identity.name;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
      onboardingComplete: false,
      mirrorPaused: false,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  },
});

/**
 * Completes onboarding: writes the user profile and creates their Mirror with a
 * first behaviour version. The AI-generated behaviour is produced asynchronously
 * via a scheduled action so onboarding stays snappy even if the AI call is slow.
 */
export const completeOnboarding = mutation({
  args: {
    name: v.string(),
    nickname: v.optional(v.string()),
    bio: v.optional(v.string()),
    interests: v.array(v.string()),
    work: v.optional(v.string()),
    communicationStyle: v.optional(v.string()),
    thingsToKnow: v.optional(v.string()),
    thingsToAvoid: v.optional(v.string()),
    privacyBoundaries: v.array(v.string()),
    mirrorName: v.optional(v.string()),
    avatarEmoji: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    await ctx.db.patch(user._id, {
      name: args.name,
      nickname: args.nickname,
      bio: args.bio,
      onboardingComplete: true,
      updatedAt: now,
    });

    // Create the Mirror (one per user). If one already exists, reuse it.
    let mirror = await ctx.db
      .query("mirrors")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
      .unique();

    const displayName = args.nickname ?? args.name;
    const mirrorName = args.mirrorName ?? `${displayName}'s Mirror`;

    const goals: string[] = [];
    const interests = args.interests;
    // Seed boundaries from the privacy answers.
    const boundaries = args.privacyBoundaries;

    if (!mirror) {
      const mirrorId = await ctx.db.insert("mirrors", {
        ownerUserId: user._id,
        name: mirrorName,
        avatarEmoji: args.avatarEmoji ?? "🪞",
        communicationStyle: args.communicationStyle,
        interests,
        goals,
        boundaries,
        thingsToKnow: args.thingsToKnow,
        thingsToAvoid: args.thingsToAvoid,
        behaviourVersion: 0,
        createdAt: now,
        updatedAt: now,
      });
      mirror = await ctx.db.get(mirrorId);
    } else {
      await ctx.db.patch(mirror._id, {
        name: mirrorName,
        avatarEmoji: args.avatarEmoji ?? mirror.avatarEmoji ?? "🪞",
        communicationStyle: args.communicationStyle,
        interests,
        boundaries,
        thingsToKnow: args.thingsToKnow,
        thingsToAvoid: args.thingsToAvoid,
        updatedAt: now,
      });
      mirror = await ctx.db.get(mirror._id);
    }

    // Seed memories from the structured onboarding answers.
    if (args.bio) {
      await ctx.db.insert("memories", {
        userId: user._id,
        mirrorId: mirror!._id,
        type: "fact",
        visibility: "shareable",
        content: args.bio,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (args.work) {
      await ctx.db.insert("memories", {
        userId: user._id,
        mirrorId: mirror!._id,
        type: "project",
        visibility: "shareable",
        content: args.work,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (args.thingsToKnow) {
      await ctx.db.insert("memories", {
        userId: user._id,
        mirrorId: mirror!._id,
        type: "fact",
        visibility: "private",
        content: args.thingsToKnow,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const boundary of boundaries) {
      await ctx.db.insert("memories", {
        userId: user._id,
        mirrorId: mirror!._id,
        type: "boundary",
        visibility: "private",
        content: boundary,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Kick off behaviour generation in the background.
    await ctx.scheduler.runAfter(0, internal.mirrors.generateBehaviourForMirror, {
      mirrorId: mirror!._id,
    });

    return { userId: user._id, mirrorId: mirror!._id };
  },
});

/**
 * Internal: look up a user by id (used by actions which cannot read the db).
 */
export const getUserById = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => ctx.db.get(args.userId),
});
