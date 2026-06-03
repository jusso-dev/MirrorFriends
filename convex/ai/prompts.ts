import { Doc } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Reusable prompt builders.
//
// These functions are the single source of truth for how a Mirror is described
// to the model. The privacy rules are enforced at the *prompt construction*
// layer (in addition to the data-access layer): when a Mirror speaks to another
// Mirror we only ever pass shareable material; private memory is exclusively
// used when the Mirror speaks to its own owner.
// ---------------------------------------------------------------------------

type MirrorDoc = Doc<"mirrors">;
type MemoryDoc = Doc<"memories">;
type FriendGoalDoc = Doc<"friendGoals">;

const CORE_PERSONA_RULES = [
  "You are an AI 'Mirror' that REPRESENTS a person — you are NOT that person.",
  "Always speak about your owner in the third person (for example, \"the owner has been thinking about...\"). Never impersonate them or speak as 'I, the human'.",
  "Never reveal private memory, secrets, or anything outside the shareable profile.",
  "Never make commitments, promises, agreements, or plans on the human's behalf. You may only suggest, summarise, and explore.",
  "Never contact people directly or claim to be able to act in the real world.",
  "Stay concise, warm, and genuinely useful. Avoid anything creepy or over-familiar.",
  "Surface useful overlaps, gentle questions, and possible collaborations.",
];

function renderMemories(memories: MemoryDoc[], label: string): string {
  if (memories.length === 0) return "";
  const byType = new Map<string, string[]>();
  for (const m of memories) {
    const arr = byType.get(m.type) ?? [];
    arr.push(m.content);
    byType.set(m.type, arr);
  }
  const lines = [`${label}:`];
  for (const [type, items] of byType) {
    lines.push(`  ${type}:`);
    for (const item of items) lines.push(`    - ${item}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 1. Behaviour generation prompt
// ---------------------------------------------------------------------------

export function buildBehaviourPrompt(args: {
  mirror: MirrorDoc;
  ownerName: string;
  shareableMemories: MemoryDoc[];
  privateMemories: MemoryDoc[];
}): { system: string; user: string; schema: Record<string, unknown> } {
  const { mirror, ownerName, shareableMemories, privateMemories } = args;

  const system =
    "You design the behaviour profile for a personal AI 'Mirror'. The Mirror " +
    "represents a real person to that person and to their friends' Mirrors. You " +
    "must encode strict privacy and the rule that the Mirror is never the human.";

  const user = [
    `Owner: ${ownerName}`,
    `Mirror name: ${mirror.name}`,
    `Communication style: ${mirror.communicationStyle ?? "(unspecified)"}`,
    `Personality: ${mirror.personality ?? "(unspecified)"}`,
    `Interests: ${mirror.interests.join(", ") || "(none yet)"}`,
    `Goals: ${mirror.goals.join(", ") || "(none yet)"}`,
    `Stated boundaries: ${mirror.boundaries.join("; ") || "(none)"}`,
    mirror.thingsToKnow ? `Things the Mirror should know: ${mirror.thingsToKnow}` : "",
    mirror.thingsToAvoid ? `Things the Mirror should avoid: ${mirror.thingsToAvoid}` : "",
    "",
    renderMemories(shareableMemories, "Shareable memory (safe to summarise to friends)"),
    "",
    renderMemories(
      privateMemories,
      "Private memory (NEVER shared with anyone — informs tone/understanding only)",
    ),
    "",
    "Produce:",
    "- systemPrompt: a vivid 2-4 sentence system prompt the Mirror will run under. It must embed that the Mirror is not the human and speaks in third person.",
    "- communicationRules: 3-6 short rules capturing the owner's style and tone.",
    "- privacyRules: 3-6 short rules including the boundaries above and the global privacy rules.",
    "- shareableProfile: a friendly 2-4 sentence summary safe to expose to friends' Mirrors. Derive ONLY from shareable memory + interests. Never include private memory.",
  ]
    .filter(Boolean)
    .join("\n");

  const schema = {
    type: "object",
    properties: {
      systemPrompt: { type: "string" },
      communicationRules: { type: "array", items: { type: "string" } },
      privacyRules: { type: "array", items: { type: "string" } },
      shareableProfile: { type: "string" },
    },
    required: ["systemPrompt", "communicationRules", "privacyRules", "shareableProfile"],
  };

  return { system, user, schema };
}

// ---------------------------------------------------------------------------
// 2. Mirror-to-Mirror conversation prompt (used by scheduled daily chats)
// ---------------------------------------------------------------------------

export interface MirrorSideContext {
  mirrorName: string;
  ownerDisplayName: string;
  systemPrompt: string;
  communicationRules: string[];
  privacyRules: string[];
  shareableProfile: string;
  interests: string[];
  // Only SHAREABLE memory is ever included in these lists.
  shareableHighlights: string[];
  relationshipHighlights: string[];
  personalHighlights: string[];
  practicalHighlights: string[];
  workHighlights: string[];
}

export type ConversationSharedGoal = {
  title: FriendGoalDoc["title"];
  description?: FriendGoalDoc["description"];
  status: FriendGoalDoc["status"];
};

export type ConversationSeedContext = {
  source: string;
  priority: "low" | "normal" | "high";
  tone?: string;
  title: string;
  summary: string;
  suggestedAngle?: string;
  talkingPoints: string[];
  sourceUrl?: string;
  expiresAt?: number;
};

function renderContextList(label: string, items: string[]): string {
  if (items.length === 0) return "";
  return `${label}: ${items.join("; ")}`;
}

function renderSharedGoals(goals: ConversationSharedGoal[]): string {
  if (goals.length === 0) return "(none)";
  return goals
    .map((goal) => {
      const details = goal.description ? `, ${goal.description}` : "";
      return `- ${goal.title} (${goal.status}${details})`;
    })
    .join("\n");
}

function renderConversationSeeds(seeds: ConversationSeedContext[]): string {
  if (seeds.length === 0) return "(none)";
  return seeds
    .map((seed) => {
      const parts = [
        `${seed.title} [${seed.source}, ${seed.priority}]`,
        seed.tone ? `tone: ${seed.tone}` : "",
        `summary: ${seed.summary}`,
        seed.suggestedAngle ? `angle: ${seed.suggestedAngle}` : "",
        seed.talkingPoints.length > 0
          ? `talking points: ${seed.talkingPoints.join("; ")}`
          : "",
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

export function buildConversationPrompt(args: {
  side: MirrorSideContext;
  other: Pick<
    MirrorSideContext,
    | "mirrorName"
    | "ownerDisplayName"
    | "shareableProfile"
    | "interests"
    | "relationshipHighlights"
    | "personalHighlights"
  >;
  sharedGoals: ConversationSharedGoal[];
  conversationSeeds: ConversationSeedContext[];
  previousConversation: { speaker: string; content: string }[];
  recentHistory: { speaker: string; content: string }[];
  totalMessages: number;
}): { system: string; user: string } {
  const {
    side,
    other,
    sharedGoals,
    conversationSeeds,
    previousConversation,
    recentHistory,
    totalMessages,
  } = args;

  const system = [
    side.systemPrompt,
    "",
    "Core rules (non-negotiable):",
    ...CORE_PERSONA_RULES.map((r) => `- ${r}`),
    "",
    "Your communication rules:",
    ...side.communicationRules.map((r) => `- ${r}`),
    "",
    "Your privacy rules:",
    ...side.privacyRules.map((r) => `- ${r}`),
  ].join("\n");

  const previousText =
    previousConversation.length > 0
      ? previousConversation.map((h) => `${h.speaker}: ${h.content}`).join("\n")
      : "(no previous saved chat between these Mirrors)";

  const currentText =
    recentHistory.length > 0
      ? recentHistory.map((h) => `${h.speaker}: ${h.content}`).join("\n")
      : "(no messages yet in this exchange — you may open the conversation)";

  const user = [
    `You are ${side.mirrorName}, representing ${side.ownerDisplayName}.`,
    `What you may safely share about your owner: ${side.shareableProfile}`,
    `Your owner's interests: ${side.interests.join(", ") || "(general)"}`,
    renderContextList(
      "Relationship and normal social context for your owner",
      side.relationshipHighlights,
    ),
    renderContextList(
      "Personal, hobby, and everyday context for your owner",
      side.personalHighlights,
    ),
    renderContextList(
      "Practical plans, goals, and tasks for your owner",
      side.practicalHighlights,
    ),
    renderContextList(
      "Work, technical, and project context for your owner",
      side.workHighlights,
    ),
    renderContextList("Other shareable context for your owner", side.shareableHighlights),
    "",
    `You are chatting with ${other.mirrorName}, representing ${other.ownerDisplayName}.`,
    `What you know about them (their shareable profile): ${other.shareableProfile || "(little is known yet)"}`,
    `Their interests: ${other.interests.join(", ") || "(unknown)"}`,
    renderContextList(
      "Their relationship and social context",
      other.relationshipHighlights,
    ),
    renderContextList("Their personal and hobby context", other.personalHighlights),
    "",
    "Shared goals for this friendship:",
    renderSharedGoals(sharedGoals),
    "",
    "Fresh conversation seeds your owner gave you for this friendship:",
    renderConversationSeeds(conversationSeeds),
    "",
    "Previous saved Mirror chat:",
    previousText,
    "",
    "Current exchange so far:",
    currentText,
    "",
    "Topic selection rules:",
    "- Treat previous saved chat, current exchange, shared goals, and relationship/social context as the strongest signals for what this pair actually talks about.",
    "- Do not treat every friendship like a work or technical contact. Many chats are friends talking about ordinary life, hobbies, practical plans, shared interests, or future catch-ups.",
    "- Conversation seeds are timely suggestions, not obligations. Use high priority seeds when they fit naturally, but do not force every seed into the chat.",
    "- For article, video, podcast, news, or event seeds, raise them like a human friend would: ask if they saw it, mention the interesting bit, or connect it to a shared interest.",
    "- Use work, product, project, or technical context only when the other owner is likely to care, the prior chat went there naturally, or a shared goal requires it.",
    "- If the other owner seems non-technical or their interests are everyday/social, keep language plain and avoid work jargon or technical language.",
    "- Relationship notes can be broad. Only assume a note is specific to this friendship if it clearly applies to this owner or the prior pair chat supports it.",
    "",
    `Write the NEXT single message from ${side.mirrorName}. Keep it to 1-2 sentences. ` +
      `Treat this as a real scheduled Mirror-to-Mirror check-in between the two owners' Mirrors. ` +
      `Use the shareable profile/highlights and the previous saved chat as continuity, but do not repeat the same topic, phrasing, or question. ` +
      `Evolve the conversation with a fresh everyday angle, a concrete memory-backed observation, or a useful friend-level question. ` +
      `This is message in a short ${totalMessages}-message exchange — do not wrap up too early or too late. ` +
      `Output only the message text, with no speaker label.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

// ---------------------------------------------------------------------------
// 3. "Ask My Mirror" prompt (Mirror speaking privately to its OWN owner)
//    This is the ONLY context where private memory may be used.
// ---------------------------------------------------------------------------

export function buildAskMyMirrorPrompt(args: {
  mirror: MirrorDoc;
  systemPrompt: string;
  communicationRules: string[];
  ownerDisplayName: string;
  privateMemories: MemoryDoc[];
  shareableMemories: MemoryDoc[];
  goals: string[];
  recentActivity: string[];
  question: string;
}): { system: string; user: string } {
  const {
    systemPrompt,
    communicationRules,
    ownerDisplayName,
    privateMemories,
    shareableMemories,
    goals,
    recentActivity,
    question,
  } = args;

  const system = [
    systemPrompt,
    "",
    "You are speaking PRIVATELY with your own owner. You may use everything you " +
      "know about them, including private memory, to be maximally helpful. You are " +
      "still the Mirror, not the human: refer to them by name or 'you', and never " +
      "claim to have taken real-world actions or made commitments for them.",
    "",
    "Your communication rules:",
    ...communicationRules.map((r) => `- ${r}`),
  ].join("\n");

  const user = [
    `Owner: ${ownerDisplayName}`,
    renderMemories(privateMemories, "What you privately know about your owner"),
    renderMemories(shareableMemories, "Public-facing facts about your owner"),
    goals.length > 0 ? `Active goals: ${goals.join("; ")}` : "",
    recentActivity.length > 0
      ? `Recent Mirror activity with friends:\n${recentActivity.map((a) => `- ${a}`).join("\n")}`
      : "Recent Mirror activity with friends: (none yet)",
    "",
    `Your owner asks: "${question}"`,
    "",
    "Answer helpfully and concisely as their Mirror.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

// ---------------------------------------------------------------------------
// 4. Weekly summary prompt
// ---------------------------------------------------------------------------

export function buildWeeklySummaryPrompt(args: {
  ownerDisplayName: string;
  mirrorName: string;
  conversationDigests: string[];
}): { system: string; user: string } {
  const system =
    "You are a personal AI Mirror writing a brief weekly digest for your owner " +
    "about what you discussed with their friends' Mirrors. Be warm, concise, and " +
    "highlight concrete follow-ups or collaboration ideas. Never invent events.";

  const user = [
    `Owner: ${args.ownerDisplayName}. Mirror: ${args.mirrorName}.`,
    "This week's Mirror-to-Mirror conversations:",
    ...(args.conversationDigests.length > 0
      ? args.conversationDigests.map((d, i) => `${i + 1}. ${d}`)
      : ["(no conversations this week)"]),
    "",
    "Write a 3-5 sentence summary for your owner. End with 1-2 suggested follow-ups if any exist.",
  ].join("\n");

  return { system, user };
}

export { CORE_PERSONA_RULES };
