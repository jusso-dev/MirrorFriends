import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// ---------------------------------------------------------------------------
// MirrorFriends Convex schema
//
// Design notes:
// - All AI/Mirror data is owned by a `users` row. Auth is handled by Convex Auth
//   (convex/auth.ts); `users._id` is the Convex Auth user id.
// - Memory is split by `visibility`: "private" memory NEVER leaves the owner's
//   Mirror; "shareable" memory feeds the public-to-friends profile.
// - The schema is intentionally future-proofed for vector embeddings: the
//   `memories` table reserves an optional `embedding` field and a commented-out
//   vector index that can be enabled later without a migration.
// ---------------------------------------------------------------------------

export const memoryType = v.union(
  v.literal("fact"),
  v.literal("preference"),
  v.literal("goal"),
  v.literal("project"),
  v.literal("relationship"),
  v.literal("boundary"),
  v.literal("opinion"),
  v.literal("task"),
);

export const memoryVisibility = v.union(
  v.literal("private"),
  v.literal("shareable"),
);

export const friendshipStatus = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("blocked"),
);

export const conversationType = v.union(
  v.literal("daily"),
  v.literal("manual"),
  v.literal("weekly_summary"),
);

export const conversationStatus = v.union(
  v.literal("pending"),
  v.literal("complete"),
  v.literal("failed"),
);

export const aiPurpose = v.union(
  v.literal("daily_conversation"),
  v.literal("manual_prompt"),
  v.literal("behaviour_generation"),
  v.literal("weekly_summary"),
);

export const notificationType = v.union(
  v.literal("friend_joined"),
  v.literal("daily_conversation_ready"),
  v.literal("weekly_summary_ready"),
);

export default defineSchema({
  // Convex Auth tables (authSessions, authAccounts, authRefreshTokens, etc.).
  // We override `users` below to add our own profile fields.
  ...authTables,

  // -------------------------------------------------------------------------
  // Our custom users table. `users._id` IS the Convex Auth user id, so every
  // function resolves the caller with `getAuthUserId(ctx)` (see authz.ts).
  // Auth-managed fields (email/name/image) are written by Convex Auth on
  // sign-in; the profile fields are filled in during onboarding. The two
  // boolean flags are optional because Convex Auth creates the row before
  // onboarding runs — reads normalise a missing value to `false`.
  users: defineTable({
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App profile fields.
    nickname: v.optional(v.string()),
    bio: v.optional(v.string()),
    onboardingComplete: v.optional(v.boolean()),
    // Global kill switch: pauses ALL of this user's Mirror activity.
    mirrorPaused: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("email", ["email"]),

  // -------------------------------------------------------------------------
  mirrors: defineTable({
    ownerUserId: v.id("users"),
    name: v.string(),
    avatarEmoji: v.optional(v.string()),
    personality: v.optional(v.string()),
    communicationStyle: v.optional(v.string()),
    interests: v.array(v.string()),
    goals: v.array(v.string()),
    boundaries: v.array(v.string()),
    // Free-form notes the user wants the Mirror to know / avoid.
    thingsToKnow: v.optional(v.string()),
    thingsToAvoid: v.optional(v.string()),
    // Cached, AI-safe summary exposed to friends' Mirrors. Regenerated alongside
    // behaviour. Never contains private memory verbatim.
    shareableProfile: v.optional(v.string()),
    behaviourVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"]),

  // -------------------------------------------------------------------------
  mirrorBehaviours: defineTable({
    mirrorId: v.id("mirrors"),
    version: v.number(),
    systemPrompt: v.string(),
    communicationRules: v.array(v.string()),
    privacyRules: v.array(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_mirror", ["mirrorId"])
    .index("by_mirror_active", ["mirrorId", "active"])
    .index("by_mirror_version", ["mirrorId", "version"]),

  // -------------------------------------------------------------------------
  memories: defineTable({
    userId: v.id("users"),
    mirrorId: v.id("mirrors"),
    type: memoryType,
    visibility: memoryVisibility,
    content: v.string(),
    archived: v.boolean(),
    // Reserved for future semantic retrieval. Unused in MVP.
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_mirror", ["mirrorId"])
    .index("by_mirror_visibility", ["mirrorId", "visibility", "archived"])
    .index("by_mirror_type", ["mirrorId", "type", "archived"]),
  // To enable semantic memory later, add (requires `embedding` to be populated):
  //   .vectorIndex("by_embedding", {
  //     vectorField: "embedding",
  //     dimensions: 1536,
  //     filterFields: ["mirrorId", "visibility", "archived"],
  //   });

  // -------------------------------------------------------------------------
  friendInvites: defineTable({
    inviterUserId: v.id("users"),
    inviterMirrorId: v.id("mirrors"),
    inviteCode: v.string(),
    // Optional: claimed by whom and when.
    claimedByUserId: v.optional(v.id("users")),
    claimedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_code", ["inviteCode"])
    .index("by_inviter", ["inviterUserId"]),

  // -------------------------------------------------------------------------
  // Friendships are stored once with a canonical ordering (userAId < userBId by
  // string id) so a pair can never be duplicated. Helpers in friends.ts enforce
  // ordering. Membership is queried via two single-column indexes.
  friendships: defineTable({
    userAId: v.id("users"),
    userBId: v.id("users"),
    mirrorAId: v.id("mirrors"),
    mirrorBId: v.id("mirrors"),
    status: friendshipStatus,
    createdAt: v.number(),
    lastConversationAt: v.optional(v.number()),
  })
    .index("by_userA", ["userAId"])
    .index("by_userB", ["userBId"])
    .index("by_status", ["status"])
    .index("by_pair", ["userAId", "userBId"]),

  // -------------------------------------------------------------------------
  mirrorConversations: defineTable({
    friendshipId: v.id("friendships"),
    type: conversationType,
    status: conversationStatus,
    // Short human-readable summary shown on cards / notifications.
    summary: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_friendship", ["friendshipId"])
    .index("by_friendship_created", ["friendshipId", "createdAt"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  mirrorMessages: defineTable({
    conversationId: v.id("mirrorConversations"),
    senderMirrorId: v.id("mirrors"),
    receiverMirrorId: v.id("mirrors"),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_created", ["conversationId", "createdAt"]),

  // -------------------------------------------------------------------------
  // "Ask My Mirror" chat: messages between a user and their own Mirror.
  mirrorAssistantMessages: defineTable({
    userId: v.id("users"),
    mirrorId: v.id("mirrors"),
    role: v.union(v.literal("user"), v.literal("mirror")),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_mirror_created", ["mirrorId", "createdAt"]),

  // -------------------------------------------------------------------------
  notifications: defineTable({
    userId: v.id("users"),
    type: notificationType,
    title: v.string(),
    body: v.string(),
    read: v.boolean(),
    // Optional deep-link target (e.g. a conversation id) for the client.
    relatedId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  // -------------------------------------------------------------------------
  aiUsage: defineTable({
    userId: v.optional(v.id("users")),
    mirrorId: v.optional(v.id("mirrors")),
    provider: v.string(), // "openai" for MVP
    model: v.string(),
    purpose: aiPurpose,
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    estimatedCost: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_mirror", ["mirrorId"])
    .index("by_created", ["createdAt"]),

  // -------------------------------------------------------------------------
  featureFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    // Optional JSON-encoded value for richer flags.
    value: v.optional(v.string()),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"]),
});
