import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// ---------------------------------------------------------------------------
// Authorization helpers.
//
// Auth itself is handled by Convex Auth (see auth.ts). These helpers resolve
// and validate the caller for the rest of the codebase. The caller's identity
// maps directly to a `users` row: `users._id === getAuthUserId(ctx)`.
//
// Every query/mutation/action that touches user data MUST go through one of
// these. There is no path that trusts a client-supplied userId.
// ---------------------------------------------------------------------------

export type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/**
 * Resolve the `users` row for the current caller, or null if unauthenticated.
 * Only usable in query/mutation contexts (needs db access).
 */
export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

/**
 * Resolve the current `users` row or throw. Use in any mutation/query that
 * requires an authenticated user.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to do that.",
    });
  }
  return user;
}

/**
 * Resolve the current user AND their Mirror, or throw. The vast majority of
 * Mirror operations need both.
 */
export async function requireUserAndMirror(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<"users">; mirror: Doc<"mirrors"> }> {
  const user = await requireUser(ctx);
  const mirror = await ctx.db
    .query("mirrors")
    .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
    .unique();
  if (!mirror) {
    throw new ConvexError({
      code: "NO_MIRROR",
      message: "Complete onboarding to create your Mirror first.",
    });
  }
  return { user, mirror };
}

/**
 * Assert that `mirrorId` is owned by `userId`. Throws otherwise.
 */
export async function assertOwnsMirror(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  mirrorId: Id<"mirrors">,
): Promise<Doc<"mirrors">> {
  const mirror = await ctx.db.get(mirrorId);
  if (!mirror || mirror.ownerUserId !== userId) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You do not own that Mirror.",
    });
  }
  return mirror;
}

/** Normalise the optional boolean profile flags for client responses. */
export function normaliseUser(user: Doc<"users">) {
  return {
    ...user,
    onboardingComplete: user.onboardingComplete ?? false,
    mirrorPaused: user.mirrorPaused ?? false,
  };
}
