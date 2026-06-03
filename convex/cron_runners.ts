import { ActionCtx, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { currentScheduleWindow, localDateKey } from "./agent_schedule";

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
export const runScheduledMirrorConversations = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ scheduled: number; skippedWindow: number; skippedReason?: string; matchedTime?: string }> => {
    const schedule = await ctx.runQuery(internal.settings.getAgentScheduleForCron, {});
    if (!schedule.enabled) {
      return { scheduled: 0, skippedWindow: 0, skippedReason: "schedule_disabled" };
    }

    const window = currentScheduleWindow(schedule);
    if (!window) {
      return { scheduled: 0, skippedWindow: 0, skippedReason: "outside_schedule" };
    }

    const result = await scheduleActiveFriendshipConversations(
      ctx,
      window.localDate,
      window.time,
      "scheduled",
    );
    console.log(
      `Scheduled cron matched ${window.time} and queued ${result.scheduled} Mirror conversation(s).`,
    );
    return { ...result, matchedTime: window.time };
  },
});

export const runDailyMirrorConversations = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number; skippedWindow: number }> => {
    const schedule = await ctx.runQuery(internal.settings.getAgentScheduleForCron, {});
    const localDate = localDateKey(schedule.timezone);
    const result = await scheduleActiveFriendshipConversations(
      ctx,
      localDate,
      "manual",
      "manual",
    );
    console.log(`Manual scheduler runner queued ${result.scheduled} Mirror conversation(s).`);
    return result;
  },
});

async function scheduleActiveFriendshipConversations(
  ctx: ActionCtx,
  localDate: string,
  slot: string,
  source: "scheduled" | "manual",
) {
  const friendships = await ctx.runQuery(
    internal.friends.listActiveFriendshipsForCron,
    {},
  );
  let scheduled = 0;
  let skippedWindow = 0;
  for (const f of friendships) {
    const claim = await ctx.runMutation(
      internal.settings.claimAgentChatWindowBudget,
      { friendshipId: f._id, localDate, slot, source },
    );
    if (!claim.claimed) {
      skippedWindow++;
      continue;
    }

    const conversationId = await ctx.runMutation(
      internal.conversations.createPendingConversation,
      { friendshipId: f._id, type: "daily" },
    );
    await ctx.scheduler.runAfter(
      scheduled * 1500,
      internal.conversations.generateDailyMirrorConversation,
      {
        friendshipId: f._id,
        conversationId,
        notify: true,
        budgetLocalDate: localDate,
        budgetSlot: slot,
      },
    );
    scheduled++;
  }
  return { scheduled, skippedWindow };
}

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
