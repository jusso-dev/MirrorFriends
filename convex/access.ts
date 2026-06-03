import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAdmin } from "./authz";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "MF-";
  for (let i = 0; i < 12; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (i === 3 || i === 7) code += "-";
  }
  return code;
}

function normalizeEmail(value?: string): string | undefined {
  const email = value?.trim().toLowerCase();
  return email || undefined;
}

function buildInviteUrl(inviteCode: string, email?: string): string {
  const siteUrl = process.env.SITE_URL ?? "http://localhost:5173";
  const url = new URL(siteUrl);
  url.searchParams.set("invite", inviteCode);
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

export const getPortalInvite = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const inviteCode = args.inviteCode.trim().toUpperCase();
    const invite = await ctx.db
      .query("accessInvites")
      .withIndex("by_code", (q) => q.eq("inviteCode", inviteCode))
      .unique();
    const now = Date.now();
    if (!invite) {
      return { valid: false, reason: "not_found" };
    }
    const expired = !!invite.expiresAt && invite.expiresAt < now;
    const claimed = !!invite.claimedByUserId;
    const revoked = !!invite.revokedAt;
    return {
      valid: !expired && !claimed && !revoked,
      reason: revoked ? "revoked" : claimed ? "claimed" : expired ? "expired" : null,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  },
});

export const listPortalInvites = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    return await ctx.db
      .query("accessInvites")
      .withIndex("by_created_by", (q) => q.eq("createdByUserId", admin._id))
      .order("desc")
      .take(25);
  },
});

export const createPortalInvite = mutation({
  args: {
    email: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const email = normalizeEmail(args.email);
    const now = Date.now();

    let inviteCode = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      const existing = await ctx.db
        .query("accessInvites")
        .withIndex("by_code", (q) => q.eq("inviteCode", inviteCode))
        .unique();
      if (!existing) break;
      inviteCode = generateInviteCode();
    }

    const inviteId = await ctx.db.insert("accessInvites", {
      inviteCode,
      email,
      role: args.role ?? "user",
      createdByUserId: admin._id,
      expiresAt: now + INVITE_TTL_MS,
      createdAt: now,
    });

    return {
      inviteId,
      inviteCode,
      inviteUrl: buildInviteUrl(inviteCode, email),
    };
  },
});

export const revokePortalInvite = mutation({
  args: { inviteId: v.id("accessInvites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invite not found." });
    }
    await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
    return { ok: true };
  },
});
