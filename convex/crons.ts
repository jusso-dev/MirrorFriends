import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Scheduled functions.
//   dailyMirrorConversations  — generates short Mirror-to-Mirror chats daily.
//   weeklyMirrorSummaries      — sends each owner a weekly digest.
//
// Times are UTC. Adjust to taste; staggering inside the runners spreads load.
// ---------------------------------------------------------------------------

const crons = cronJobs();

crons.daily(
  "dailyMirrorConversations",
  { hourUTC: 15, minuteUTC: 0 }, // ~mid-morning AEST / start of US day
  internal.cron_runners.runDailyMirrorConversations,
  {},
);

crons.weekly(
  "weeklyMirrorSummaries",
  { dayOfWeek: "sunday", hourUTC: 23, minuteUTC: 0 },
  internal.cron_runners.runWeeklyMirrorSummaries,
  {},
);

export default crons;
