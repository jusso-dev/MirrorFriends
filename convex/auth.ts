import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";

// ---------------------------------------------------------------------------
// Authentication helpers.
//
// Every query/mutation/action that touches user data MUST resolve and validate
// the caller through one of these helpers. There is no path that trusts a
// client-supplied userId.
// ---------------------------------------------------------------------------

export type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/**
 * Returns the verified external identity subject, or null if unauthenticated.
 */
export async function getSubject(ctx: AnyCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/**
 * Resolve the `users` row for the current caller. Returns null if the caller is
 * unauthenticated or has no row yet (i.e. has not been provisioned).
 *
 * Only usable in query/mutation contexts (needs db access). For actions, use
 * `requireUserInAction` which round-trips through an internal query.
 */
export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const subject = await getSubject(ctx);
  if (!subject) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", subject))
    .unique();
}

/**
 * Resolve the current `users` row or throw. Use in any mutation/query that
 * requires an authenticated, provisioned user.
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
 * Assert that `mirrorId` is owned by `userId`. Throws otherwise. Used to guard
 * cross-Mirror data access.
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
