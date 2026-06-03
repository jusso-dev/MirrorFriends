import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrNull, requireUser, normaliseUser } from "./authz";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Users + onboarding.
//
// The `users` row itself is created by Convex Auth on first sign-in (see
// auth.ts). This module fills in the app profile and creates the Mirror.
// ---------------------------------------------------------------------------

/**
 * Returns the current user (with normalised boolean flags) along with their
 * Mirror (if any). The web app calls this on launch to decide whether to
 * show onboarding or home.
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
    return { user: normaliseUser(user), mirror: mirror ?? null };
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
      mirrorPaused: user.mirrorPaused ?? false,
      createdAt: user.createdAt ?? now,
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
