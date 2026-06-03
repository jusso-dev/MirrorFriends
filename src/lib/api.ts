import { makeFunctionReference } from "convex/server";

type Empty = Record<string, never>;

const query = <Args extends Record<string, unknown>, Ret>(name: string) =>
  makeFunctionReference<"query", Args, Ret>(name);

const mutation = <Args extends Record<string, unknown>, Ret>(name: string) =>
  makeFunctionReference<"mutation", Args, Ret>(name);

const action = <Args extends Record<string, unknown>, Ret>(name: string) =>
  makeFunctionReference<"action", Args, Ret>(name);

export type Id = string;

export type User = {
  _id: Id;
  email?: string;
  name?: string;
  nickname?: string;
  bio?: string;
  role?: "admin" | "user";
  onboardingComplete?: boolean;
  mirrorPaused?: boolean;
};

export type Mirror = {
  _id: Id;
  ownerUserId: Id;
  name: string;
  avatarEmoji?: string;
  personality?: string;
  communicationStyle?: string;
  interests: string[];
  goals: string[];
  boundaries: string[];
  thingsToKnow?: string;
  thingsToAvoid?: string;
  shareableProfile?: string;
  behaviourVersion: number;
  updatedAt: number;
};

export type MirrorBehaviour = {
  _id: Id;
  mirrorId: Id;
  version: number;
  systemPrompt: string;
  communicationRules: string[];
  privacyRules: string[];
  active: boolean;
  createdAt: number;
};

export type CurrentUser = {
  user: User;
  mirror: Mirror | null;
};

export type Memory = {
  _id: Id;
  type:
    | "fact"
    | "preference"
    | "goal"
    | "project"
    | "relationship"
    | "boundary"
    | "opinion"
    | "task";
  visibility: "private" | "shareable";
  content: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ChatImportProfileDraft = {
  communicationStyle?: string;
  personality?: string;
  thingsToKnow?: string;
  interests: string[];
  goals: string[];
};

export type ChatImportMemoryDraft = {
  type: Memory["type"];
  visibility: Memory["visibility"];
  content: string;
};

export type ChatImportAnalysis = {
  profile: ChatImportProfileDraft;
  memories: ChatImportMemoryDraft[];
  topics: string[];
  safetyNotes: string[];
  toneSummary?: string;
  personalitySummary?: string;
  rawCharacterCount: number;
  analyzedCharacterCount: number;
  truncated: boolean;
};

export type ConversationSeedSource =
  | "video"
  | "article"
  | "podcast"
  | "news"
  | "event"
  | "personal_note"
  | "friend_note"
  | "other";

export type ConversationSeedPriority = "low" | "normal" | "high";

export type ConversationSeedTone =
  | "casual"
  | "curious"
  | "practical"
  | "funny"
  | "supportive";

export type ConversationSeedDraft = {
  source: ConversationSeedSource;
  visibility: Memory["visibility"];
  priority: ConversationSeedPriority;
  tone?: ConversationSeedTone;
  title: string;
  summary: string;
  suggestedAngle?: string;
  talkingPoints: string[];
  sourceUrl?: string;
  expiresAt?: number;
};

export type ConversationSeed = ConversationSeedDraft & {
  _id: Id;
  userId: Id;
  mirrorId: Id;
  friendshipId?: Id;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  friendMirrorName?: string;
};

export type ConversationSeedAnalysis = {
  seeds: ConversationSeedDraft[];
  safetyNotes: string[];
  rawCharacterCount: number;
  analyzedCharacterCount: number;
  truncated: boolean;
};

export type FriendSummary = {
  friendship: {
    _id: Id;
    status: "pending" | "active" | "paused" | "blocked";
    createdAt: number;
    lastConversationAt?: number;
  };
  friendUser: { _id: Id; name: string; nickname?: string } | null;
  friendMirror: { _id: Id; name: string; avatarEmoji?: string } | null;
};

export type FriendGoalStatus =
  | "proposed"
  | "agreed"
  | "in_progress"
  | "done"
  | "declined";

export type FriendGoalSummary = {
  goal: {
    _id: Id;
    friendshipId: Id;
    createdByUserId: Id;
    needsResponseFromUserId?: Id;
    respondedByUserId?: Id;
    updatedByUserId?: Id;
    title: string;
    description?: string;
    status: FriendGoalStatus;
    agreedAt?: number;
    declinedAt?: number;
    completedAt?: number;
    createdAt: number;
    updatedAt: number;
  };
  friendshipId: Id;
  friendMirrorName: string;
  friendMirrorEmoji?: string;
  createdByCurrentUser: boolean;
  updatedByCurrentUser: boolean;
  needsResponseFromCurrentUser: boolean;
};

export type ConversationSummary = {
  conversation: {
    _id: Id;
    friendshipId: Id;
    type: "daily" | "manual" | "weekly_summary";
    status: "pending" | "complete" | "failed";
    summary?: string;
    createdAt: number;
  };
  friendshipId: Id;
  friendMirrorName: string;
  friendMirrorEmoji?: string;
};

export type MirrorMessage = {
  _id: Id;
  conversationId: Id;
  senderMirrorId: Id;
  receiverMirrorId: Id;
  content: string;
  createdAt: number;
};

export type ConversationThread = {
  conversation: ConversationSummary["conversation"];
  messages: MirrorMessage[];
};

export type AssistantMessage = {
  _id: Id;
  userId: Id;
  mirrorId: Id;
  role: "user" | "mirror";
  content: string;
  createdAt: number;
};

export type AppNotification = {
  _id: Id;
  type:
    | "friend_joined"
    | "daily_conversation_ready"
    | "weekly_summary_ready"
    | "friend_goal_proposed"
    | "friend_goal_updated";
  title: string;
  body: string;
  read: boolean;
  relatedId?: string;
  createdAt: number;
};

export type UsageEstimate = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  byPurpose: Record<string, number>;
};

export type AgentSchedule = {
  enabled: boolean;
  timezone: string;
  times: string[];
  maxChatsPerDay: number;
  messagesPerChat: number;
  maxMessagesPerDay: number;
  schedulerIntervalMinutes: number;
};

export type AccessInvite = {
  _id: Id;
  inviteCode: string;
  email?: string;
  role: "admin" | "user";
  createdByUserId: Id;
  claimedByUserId?: Id;
  claimedAt?: number;
  revokedAt?: number;
  expiresAt?: number;
  createdAt: number;
};

export type AccessInvitePreview = {
  valid: boolean;
  reason: "not_found" | "revoked" | "claimed" | "expired" | null;
  email?: string;
  role?: "admin" | "user";
  expiresAt?: number;
};

export const api = {
  users: {
    getCurrentUser: query<Empty, CurrentUser | null>("users:getCurrentUser"),
    completeOnboarding: mutation<
      {
        name: string;
        nickname?: string;
        bio?: string;
        interests: string[];
        work?: string;
        communicationStyle?: string;
        thingsToKnow?: string;
        thingsToAvoid?: string;
        privacyBoundaries: string[];
        mirrorName?: string;
        avatarEmoji?: string;
      },
      { userId: Id; mirrorId: Id }
    >("users:completeOnboarding"),
  },
  mirrors: {
    getMyMirror: query<Empty, { mirror: Mirror; behaviour: MirrorBehaviour | null }>(
      "mirrors:getMyMirror",
    ),
    updateMirrorProfile: mutation<
      Partial<
        Pick<
          Mirror,
          | "name"
          | "avatarEmoji"
          | "personality"
          | "communicationStyle"
          | "interests"
          | "goals"
          | "boundaries"
          | "thingsToKnow"
          | "thingsToAvoid"
        >
      >,
      { ok: boolean }
    >("mirrors:updateMirrorProfile"),
    generateMirrorBehaviour: action<Empty, { version: number }>(
      "mirrors:generateMirrorBehaviour",
    ),
  },
  memories: {
    listMyMemories: query<
      { visibility?: Memory["visibility"]; type?: Memory["type"]; includeArchived?: boolean },
      Memory[]
    >("memories:listMyMemories"),
    addMemory: mutation<
      { type: Memory["type"]; visibility: Memory["visibility"]; content: string },
      Id
    >("memories:addMemory"),
    archiveMemory: mutation<{ memoryId: Id; archived?: boolean }, { ok: boolean }>(
      "memories:archiveMemory",
    ),
    analyzeChatLogImport: action<
      {
        chatLog: string;
        ownerHandle?: string;
        otherHandle?: string;
        sourceLabel?: string;
      },
      ChatImportAnalysis
    >("memories:analyzeChatLogImport"),
    applyChatLogImport: mutation<
      {
        updateProfile: boolean;
        profile: ChatImportProfileDraft;
        memories: ChatImportMemoryDraft[];
      },
      { inserted: number; profileUpdated: boolean }
    >("memories:applyChatLogImport"),
  },
  conversationSeeds: {
    listMyConversationSeeds: query<
      { includeArchived?: boolean; includeExpired?: boolean },
      ConversationSeed[]
    >("conversationSeeds:listMyConversationSeeds"),
    createConversationSeed: mutation<
      { friendshipId?: Id; seed: ConversationSeedDraft },
      Id
    >("conversationSeeds:createConversationSeed"),
    createConversationSeeds: mutation<
      { friendshipId?: Id; seeds: ConversationSeedDraft[] },
      { inserted: number; ids: Id[] }
    >("conversationSeeds:createConversationSeeds"),
    archiveConversationSeed: mutation<
      { seedId: Id; archived?: boolean },
      { ok: boolean }
    >("conversationSeeds:archiveConversationSeed"),
    analyzeConversationSeedSource: action<
      {
        source: ConversationSeedSource;
        sourceUrl?: string;
        content: string;
        ownerIntent?: string;
      },
      ConversationSeedAnalysis
    >("conversationSeeds:analyzeConversationSeedSource"),
  },
  friends: {
    listMyFriends: query<Empty, FriendSummary[]>("friends:listMyFriends"),
    listFriendGoals: query<{ friendshipId?: Id }, FriendGoalSummary[]>(
      "friends:listFriendGoals",
    ),
    createFriendInvite: mutation<Empty, { inviteCode: string }>("friends:createFriendInvite"),
    acceptFriendInvite: mutation<
      { inviteCode: string },
      { friendshipId: Id; alreadyFriends: boolean }
    >("friends:acceptFriendInvite"),
    createFriendGoal: mutation<
      { friendshipId: Id; title: string; description?: string },
      Id
    >("friends:createFriendGoal"),
    updateFriendGoal: mutation<
      { goalId: Id; title: string; description?: string },
      { ok: boolean; status: FriendGoalStatus }
    >("friends:updateFriendGoal"),
    updateFriendGoalStatus: mutation<
      { goalId: Id; status: FriendGoalStatus },
      { ok: boolean; status: FriendGoalStatus }
    >("friends:updateFriendGoalStatus"),
    removeFriendship: mutation<{ friendshipId: Id }, { ok: boolean; status: "blocked" }>(
      "friends:removeFriendship",
    ),
  },
  conversations: {
    listMirrorConversations: query<{ limit?: number }, ConversationSummary[]>(
      "conversations:listMirrorConversations",
    ),
    listConversationMessages: query<{ conversationId: Id }, ConversationThread>(
      "conversations:listConversationMessages",
    ),
    listAssistantMessages: query<{ limit?: number }, AssistantMessage[]>(
      "conversations:listAssistantMessages",
    ),
    askMyMirror: action<{ question: string }, { answer: string }>(
      "conversations:askMyMirror",
    ),
    generateConversationNow: action<{ friendshipId: Id }, { conversationId: Id }>(
      "conversations:generateConversationNow",
    ),
  },
  notifications: {
    listNotifications: query<
      { unreadOnly?: boolean; limit?: number },
      AppNotification[]
    >("notifications:listNotifications"),
    markNotificationRead: mutation<{ notificationId: Id }, { ok: boolean }>(
      "notifications:markNotificationRead",
    ),
    markAllRead: mutation<Empty, { count: number }>("notifications:markAllRead"),
  },
  settings: {
    getAgentSchedule: query<Empty, AgentSchedule>("settings:getAgentSchedule"),
    updateAgentSchedule: mutation<
      { enabled: boolean; timezone: string; times: string[] },
      AgentSchedule
    >("settings:updateAgentSchedule"),
    getAiUsageEstimate: query<Empty, UsageEstimate>("settings:getAiUsageEstimate"),
    setMirrorPaused: mutation<{ paused: boolean }, { paused: boolean }>(
      "settings:setMirrorPaused",
    ),
  },
  access: {
    getPortalInvite: query<{ inviteCode: string }, AccessInvitePreview>(
      "access:getPortalInvite",
    ),
    listPortalInvites: query<Empty, AccessInvite[]>("access:listPortalInvites"),
    createPortalInvite: mutation<
      { email?: string; role?: "admin" | "user" },
      { inviteId: Id; inviteCode: string; inviteUrl: string }
    >("access:createPortalInvite"),
    revokePortalInvite: mutation<{ inviteId: Id }, { ok: boolean }>(
      "access:revokePortalInvite",
    ),
  },
};
