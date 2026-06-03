import { action, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireUserAndMirror } from "./authz";
import {
  conversationSeedPriority,
  conversationSeedSource,
  conversationSeedTone,
  memoryVisibility,
} from "./schema";
import { internal } from "./_generated/api";

const MAX_SOURCE_CHARS = 80_000;
const MAX_SEEDS_PER_ANALYSIS = 6;
const MAX_SEEDS_PER_SAVE = 8;

const conversationSeedDraft = v.object({
  source: conversationSeedSource,
  visibility: memoryVisibility,
  priority: conversationSeedPriority,
  tone: v.optional(conversationSeedTone),
  title: v.string(),
  summary: v.string(),
  suggestedAngle: v.optional(v.string()),
  talkingPoints: v.array(v.string()),
  sourceUrl: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
});

function cleanText(value: unknown, max = 1200): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function cleanLongText(value: string, max = MAX_SOURCE_CHARS): string {
  return value.trim().slice(0, max);
}

function cleanList(value: unknown, maxItems = 5, maxLen = 140): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = cleanText(item, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanUrl(value?: string): string | undefined {
  const text = cleanText(value, 1000);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function validSource(value: unknown) {
  const sources = new Set([
    "video",
    "article",
    "podcast",
    "news",
    "event",
    "personal_note",
    "friend_note",
    "other",
  ]);
  return sources.has(String(value)) ? (value as any) : "other";
}

function validPriority(value: unknown) {
  return value === "low" || value === "normal" || value === "high"
    ? value
    : "normal";
}

function validTone(value: unknown) {
  return value === "casual" ||
    value === "curious" ||
    value === "practical" ||
    value === "funny" ||
    value === "supportive"
    ? value
    : undefined;
}

function normaliseDraft(raw: any, fallbackSource: string, sourceUrl?: string) {
  const title = cleanText(raw?.title, 90);
  const summary = cleanText(raw?.summary, 420);
  if (!title || !summary) return null;
  return {
    source: validSource(raw?.source ?? fallbackSource),
    visibility: raw?.visibility === "private" ? "private" : "shareable",
    priority: validPriority(raw?.priority),
    tone: validTone(raw?.tone),
    title,
    summary,
    suggestedAngle: cleanText(raw?.suggestedAngle, 260),
    talkingPoints: cleanList(raw?.talkingPoints, 5, 140),
    sourceUrl: cleanUrl(raw?.sourceUrl) ?? sourceUrl,
  };
}

async function assertFriendshipMember(ctx: any, userId: string, friendshipId?: string) {
  if (!friendshipId) return;
  const friendship = await ctx.db.get(friendshipId);
  if (!friendship || (friendship.userAId !== userId && friendship.userBId !== userId)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Not your friendship." });
  }
  if (friendship.status === "blocked") {
    throw new ConvexError({ code: "BLOCKED", message: "Friendship is blocked." });
  }
}

function cleanSeedForSave(seed: any) {
  const title = cleanText(seed.title, 90);
  const summary = cleanText(seed.summary, 520);
  if (!title || !summary) {
    throw new ConvexError({
      code: "INVALID_SEED",
      message: "Add a title and summary before saving.",
    });
  }
  return {
    source: seed.source,
    visibility: seed.visibility,
    priority: seed.priority,
    tone: seed.tone,
    title,
    summary,
    suggestedAngle: cleanText(seed.suggestedAngle, 280),
    talkingPoints: cleanList(seed.talkingPoints, 6, 150),
    sourceUrl: cleanUrl(seed.sourceUrl),
    expiresAt:
      typeof seed.expiresAt === "number" && Number.isFinite(seed.expiresAt)
        ? seed.expiresAt
        : undefined,
  };
}

export const listMyConversationSeeds = query({
  args: {
    includeArchived: v.optional(v.boolean()),
    includeExpired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    const now = Date.now();
    let rows = await ctx.db
      .query("conversationSeeds")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    rows = rows.filter((seed) => seed.mirrorId === mirror._id);
    if (!args.includeArchived) rows = rows.filter((seed) => !seed.archived);
    if (!args.includeExpired) {
      rows = rows.filter((seed) => !seed.expiresAt || seed.expiresAt > now);
    }

    const out = [];
    for (const seed of rows) {
      let friendMirrorName: string | undefined;
      if (seed.friendshipId) {
        const friendship = await ctx.db.get(seed.friendshipId);
        if (friendship) {
          const friendMirrorId =
            friendship.mirrorAId === mirror._id
              ? friendship.mirrorBId
              : friendship.mirrorAId;
          const friendMirror = await ctx.db.get(friendMirrorId);
          friendMirrorName = friendMirror?.name;
        }
      }
      out.push({
        ...seed,
        friendMirrorName,
      });
    }
    return out;
  },
});

export const createConversationSeed = mutation({
  args: {
    friendshipId: v.optional(v.id("friendships")),
    seed: conversationSeedDraft,
  },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    await assertFriendshipMember(ctx, user._id, args.friendshipId);
    const seed = cleanSeedForSave(args.seed);
    const now = Date.now();
    return await ctx.db.insert("conversationSeeds", {
      userId: user._id,
      mirrorId: mirror._id,
      friendshipId: args.friendshipId,
      ...seed,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createConversationSeeds = mutation({
  args: {
    friendshipId: v.optional(v.id("friendships")),
    seeds: v.array(conversationSeedDraft),
  },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    await assertFriendshipMember(ctx, user._id, args.friendshipId);
    const now = Date.now();
    const ids = [];
    for (const rawSeed of args.seeds.slice(0, MAX_SEEDS_PER_SAVE)) {
      const seed = cleanSeedForSave(rawSeed);
      const id = await ctx.db.insert("conversationSeeds", {
        userId: user._id,
        mirrorId: mirror._id,
        friendshipId: args.friendshipId,
        ...seed,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    return { inserted: ids.length, ids };
  },
});

export const archiveConversationSeed = mutation({
  args: {
    seedId: v.id("conversationSeeds"),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const seed = await ctx.db.get(args.seedId);
    if (!seed || seed.userId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your seed." });
    }
    await ctx.db.patch(args.seedId, {
      archived: args.archived ?? true,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const analyzeConversationSeedSource = action({
  args: {
    source: conversationSeedSource,
    sourceUrl: v.optional(v.string()),
    content: v.string(),
    ownerIntent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = cleanLongText(args.content);
    const sourceUrl = cleanUrl(args.sourceUrl);
    if (content.length < 120) {
      throw new ConvexError({
        code: "TOO_SHORT",
        message:
          "Paste more of the transcript, article, or notes so there is enough signal.",
      });
    }

    const c = await ctx.runQuery(internal.memories.getChatImportContext, {});
    const truncated = args.content.trim().length > MAX_SOURCE_CHARS;

    const system = [
      "You extract short-lived conversation seeds for a personal AI Mirror.",
      "A conversation seed is a concise talking point the Mirror can naturally mention to friends later.",
      "Do not store raw source text. Do not quote long passages. Summarise the idea in original wording.",
      "Avoid sensitive personal data, private claims, and anything that would be unsafe or strange to raise with friends.",
      "Prefer casual, concrete prompts like asking if someone saw something, mentioning an upcoming release or event, or connecting a topic to shared interests.",
      "Return only useful seeds that would sound natural in a short friend conversation.",
    ].join("\n");

    const prompt = [
      `Owner display name: ${c.ownerDisplayName}`,
      `Mirror name: ${c.mirror.name}`,
      `Owner interests: ${c.mirror.interests.join(", ") || "(none yet)"}`,
      `Owner goals: ${c.mirror.goals.join(", ") || "(none yet)"}`,
      `Source type: ${args.source}`,
      sourceUrl ? `Source URL: ${sourceUrl}` : "",
      cleanText(args.ownerIntent, 500)
        ? `Owner's intended angle: ${cleanText(args.ownerIntent, 500)}`
        : "",
      "",
      "Return JSON with:",
      "- safetyNotes: short cautions or reasons some content was skipped",
      "- seeds: 2-6 seed objects",
      "",
      "Each seed object must include:",
      "- source: one of video, article, podcast, news, event, personal_note, friend_note, other",
      "- visibility: shareable or private. Use shareable only for public-safe topics suitable for friend conversations.",
      "- priority: low, normal, or high",
      "- tone: casual, curious, practical, funny, or supportive",
      "- title: short label",
      "- summary: 1-2 sentence source summary",
      "- suggestedAngle: how the Mirror should naturally raise it",
      "- talkingPoints: 2-5 concise bullets",
      "",
      truncated ? `The source was truncated to ${MAX_SOURCE_CHARS} characters.` : "",
      "Source material:",
      content,
    ]
      .filter(Boolean)
      .join("\n");

    const schema = {
      type: "object",
      properties: {
        safetyNotes: { type: "array", items: { type: "string" } },
        seeds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              visibility: { type: "string" },
              priority: { type: "string" },
              tone: { type: "string" },
              title: { type: "string" },
              summary: { type: "string" },
              suggestedAngle: { type: "string" },
              talkingPoints: { type: "array", items: { type: "string" } },
              sourceUrl: { type: "string" },
            },
            required: ["title", "summary", "suggestedAngle", "talkingPoints"],
          },
        },
      },
      required: ["safetyNotes", "seeds"],
    };

    const { provider } = await import("./ai/provider");
    const raw = await provider.generateStructured<any>({
      system,
      prompt,
      schema,
      purpose: "conversation_seed",
      userId: c.userId,
      mirrorId: c.mirrorId,
      maxTokens: 1600,
      temperature: 0.35,
      ctx,
    });

    const seeds = Array.isArray(raw?.seeds) ? raw.seeds : [];
    return {
      seeds: seeds
        .map((seed: any) => normaliseDraft(seed, args.source, sourceUrl))
        .filter(Boolean)
        .slice(0, MAX_SEEDS_PER_ANALYSIS),
      safetyNotes: cleanList(raw?.safetyNotes, 8, 160),
      rawCharacterCount: args.content.trim().length,
      analyzedCharacterCount: content.length,
      truncated,
    };
  },
});
