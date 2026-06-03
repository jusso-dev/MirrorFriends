import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireUser } from "./authz";

// ---------------------------------------------------------------------------
// Notifications. For the MVP we persist notification records in Convex and the
// browser app subscribes to them reactively. Push delivery is intentionally out
// of scope for the web MVP.
// ---------------------------------------------------------------------------

export const listNotifications = query({
  args: { unreadOnly: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let q = ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc");
    const rows = await q.take(args.limit ?? 100);
    return args.unreadOnly ? rows.filter((n) => !n.read) : rows;
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();
    return rows.length;
  },
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const n = await ctx.db.get(args.notificationId);
    if (!n || n.userId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your notification." });
    }
    await ctx.db.patch(args.notificationId, { read: true });
    return { ok: true };
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();
    for (const n of rows) await ctx.db.patch(n._id, { read: true });
    return { count: rows.length };
  },
});
