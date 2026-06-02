import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Cron fan-out runners. Kept separate from crons.ts (which only declares the
// schedule) so the orchestration logic is testable and easy to trigger manually.
//
// Both runners spread work out with small per-item delays so a large user base
// doesn't hammer the AI provider in a single burst.
// ---------------------------------------------------------------------------

/**
 * Daily: for every eligible (active, non-paused) friendship, create a pending
 * conversation and schedule its generation. Notifications are created when each
 * conversation completes (see finalizeConversation).
 */
export const runDailyMirrorConversations = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const friendships = await ctx.runQuery(
      internal.friends.listActiveFriendshipsForCron,
      {},
    );
    let scheduled = 0;
    for (const f of friendships) {
      const conversationId = await ctx.runMutation(
        internal.conversations.createPendingConversation,
        { friendshipId: f._id, type: "daily" },
      );
      // Stagger generation to smooth out provider load.
      await ctx.scheduler.runAfter(
        scheduled * 1500,
        internal.conversations.generateDailyMirrorConversation,
        { friendshipId: f._id, conversationId, notify: true },
      );
      scheduled++;
    }
    console.log(`Daily cron scheduled ${scheduled} Mirror conversation(s).`);
    return { scheduled };
  },
});

/**
 * Weekly: generate a digest notification per active Mirror owner.
 */
export const runWeeklyMirrorSummaries = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const userIds = await ctx.runQuery(internal.friends.listActiveMirrorOwners, {});
    let scheduled = 0;
    for (const userId of userIds) {
      await ctx.scheduler.runAfter(
        scheduled * 1500,
        internal.conversations.generateWeeklySummary,
        { userId },
      );
      scheduled++;
    }
    console.log(`Weekly cron scheduled ${scheduled} summary(ies).`);
    return { scheduled };
  },
});
