import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Scheduled functions.
//   mirrorConversationScheduler — checks admin-configured chat windows.
//   weeklyMirrorSummaries       — sends each owner a weekly digest.
//
// Convex cron schedules are static, so the conversation scheduler runs often
// and the runner checks app settings before doing any AI work.
// ---------------------------------------------------------------------------

const crons = cronJobs();

crons.interval(
  "mirrorConversationScheduler",
  { minutes: 15 },
  internal.cron_runners.runScheduledMirrorConversations,
  {},
);

crons.weekly(
  "weeklyMirrorSummaries",
  { dayOfWeek: "sunday", hourUTC: 23, minuteUTC: 0 },
  internal.cron_runners.runWeeklyMirrorSummaries,
  {},
);

export default crons;
