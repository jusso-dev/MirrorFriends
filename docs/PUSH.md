# Push notifications

For the MVP, notifications are **persisted records** in the `notifications`
Convex table. The app reads them via `notifications:listNotifications` /
`unreadCount` and marks them read with `markNotificationRead`.

Records are created when:
- a friend accepts your invite (`friend_joined`),
- a daily Mirror conversation completes (`daily_conversation_ready`),
- a weekly summary is generated (`weekly_summary_ready`).

## Wiring real delivery later (optional)

Actual APNs/FCM delivery is intentionally stubbed because cross-platform push
setup under Skip is heavy. The integration point is small and isolated:

1. Add a `pushTokens` table keyed by `userId` (store APNs / FCM tokens
   registered by the app).
2. In `conversations.finalizeConversation` (and the friend-joined / weekly
   paths), after inserting the notification record, `ctx.scheduler.runAfter(0,
   internal.push.deliver, { userId, title, body })`.
3. Implement `convex/push.ts` `deliver` as an action that POSTs to APNs/FCM
   (their HTTP APIs work fine from a Convex action).

No schema migration is required to start — the notification records already
carry `title`, `body`, `type`, and a `relatedId` deep-link target.
