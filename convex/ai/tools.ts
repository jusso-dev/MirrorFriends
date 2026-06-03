import { ActionCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ---------------------------------------------------------------------------
// Minimal internal tool system.
//
// Tools are NOT exposed to the browser app. They are helpers used inside Convex
// actions to gather context for the model. Each tool enforces the privacy
// boundary appropriate to its caller — e.g. `friendshipGetContext` only ever
// returns the other Mirror's SHAREABLE profile.
// ---------------------------------------------------------------------------

export type MirrorToolName =
  | "memory.search"
  | "friendship.getContext"
  | "goals.getActive"
  | "conversation.getRecent";

/**
 * memory.search — relevant memories for a Mirror. `visibility` defaults to
 * "shareable" for safety; callers that legitimately operate within the owner's
 * own context (Ask My Mirror) may request "private".
 */
export async function memorySearch(
  ctx: ActionCtx,
  args: {
    mirrorId: Id<"mirrors">;
    query: string;
    visibility?: "private" | "shareable";
    limit?: number;
  },
): Promise<{ type: string; content: string }[]> {
  const rows = await ctx.runQuery(internal.memories.searchMemories, {
    mirrorId: args.mirrorId,
    queryText: args.query,
    visibility: args.visibility ?? "shareable",
    limit: args.limit ?? 8,
  });
  return rows.map((m) => ({ type: m.type, content: m.content }));
}

/**
 * friendship.getContext — relationship context for a friendship from the
 * perspective of `forMirrorId`. Only the other Mirror's shareable profile is
 * returned, never private memory.
 */
export async function friendshipGetContext(
  ctx: ActionCtx,
  args: { friendshipId: Id<"friendships">; forMirrorId: Id<"mirrors"> },
) {
  return await ctx.runQuery(internal.friends.getFriendshipContext, args);
}

/**
 * goals.getActive — current (non-archived) goals for a Mirror. Visibility-aware:
 * shareable goals only unless the owner context is in play.
 */
export async function goalsGetActive(
  ctx: ActionCtx,
  args: {
    mirrorId: Id<"mirrors">;
    visibility?: "private" | "shareable";
    limit?: number;
  },
): Promise<string[]> {
  const rows = await ctx.runQuery(internal.memories.getMemoriesForMirror, {
    mirrorId: args.mirrorId,
    visibility: args.visibility,
    types: ["goal"],
    limit: args.limit ?? 10,
  });
  return rows.map((m) => m.content);
}

/**
 * conversation.getRecent — recent Mirror-to-Mirror messages for a friendship,
 * formatted as "MirrorName: content" lines for prompt context.
 */
export async function conversationGetRecent(
  ctx: ActionCtx,
  args: { friendshipId: Id<"friendships">; limit?: number },
): Promise<{ speaker: string; content: string }[]> {
  return await ctx.runQuery(internal.conversations.getRecentMessagesForFriendship, {
    friendshipId: args.friendshipId,
    limit: args.limit ?? 10,
  });
}

// A small registry so tool dispatch can be made dynamic later (e.g. model-driven
// tool calling). For the MVP, actions call the typed helpers above directly.
export const TOOL_REGISTRY: Record<MirrorToolName, string> = {
  "memory.search": "Search a Mirror's memories for relevant context.",
  "friendship.getContext": "Get relationship context for a friendship.",
  "goals.getActive": "List a Mirror's active goals.",
  "conversation.getRecent": "List recent Mirror-to-Mirror messages.",
};
