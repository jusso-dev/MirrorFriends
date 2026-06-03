import { query, mutation, action, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireUserAndMirror } from "./authz";
import { memoryType, memoryVisibility } from "./schema";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Memory system. Memory is split by visibility:
//   - "private": only ever used to help the owner's OWN Mirror understand them.
//   - "shareable": safe summary that may surface to connected friends' Mirrors.
// The data-access layer guarantees private memory never crosses Mirror boundary.
// ---------------------------------------------------------------------------

const MAX_CHAT_IMPORT_CHARS = 60_000;
const MAX_IMPORTED_MEMORIES = 18;
const VALID_MEMORY_TYPES = new Set([
  "fact",
  "preference",
  "goal",
  "project",
  "relationship",
  "boundary",
  "opinion",
  "task",
]);
const VALID_VISIBILITIES = new Set(["private", "shareable"]);

const chatImportProfileDraft = v.object({
  communicationStyle: v.optional(v.string()),
  personality: v.optional(v.string()),
  thingsToKnow: v.optional(v.string()),
  interests: v.array(v.string()),
  goals: v.array(v.string()),
});

const chatImportMemoryDraft = v.object({
  type: memoryType,
  visibility: memoryVisibility,
  content: v.string(),
});

function cleanText(value: unknown, max = 1600): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function cleanList(value: unknown, maxItems = 12, maxLen = 80): string[] {
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

function appendProfileNote(existing: string | undefined, label: string, addition?: string) {
  const cleanAddition = cleanText(addition, 1800);
  if (!cleanAddition) return existing;
  const prefix = `${label}: ${cleanAddition}`;
  if (!existing) return prefix;
  if (existing.includes(cleanAddition.slice(0, 80))) return existing;
  return `${existing.trim()}\n\n${prefix}`.slice(0, 5000);
}

function mergeUnique(existing: string[], incoming: string[], maxItems = 24) {
  const out = [...existing];
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  for (const item of incoming) {
    const clean = cleanText(item, 80);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normaliseImportDraft(raw: any) {
  const profile = {
    communicationStyle:
      cleanText(raw?.communicationStyle, 1200) ??
      cleanText(raw?.toneSummary, 1200) ??
      "",
    personality:
      cleanText(raw?.personalitySummary, 1200) ??
      cleanText(raw?.personality, 1200) ??
      "",
    thingsToKnow: cleanText(raw?.thingsToKnow, 1600) ?? "",
    interests: cleanList(raw?.interests, 14),
    goals: cleanList(raw?.goals, 10),
  };

  const memories = Array.isArray(raw?.memories) ? raw.memories : [];
  const memoryDrafts = memories
    .map((memory: any) => {
      const type = VALID_MEMORY_TYPES.has(memory?.type) ? memory.type : "fact";
      const visibility = VALID_VISIBILITIES.has(memory?.visibility)
        ? memory.visibility
        : "private";
      const content = cleanText(memory?.content, 520);
      return content ? { type, visibility, content } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_IMPORTED_MEMORIES);

  return {
    profile,
    memories: memoryDrafts,
    topics: cleanList(raw?.topics, 16),
    safetyNotes: cleanList(raw?.safetyNotes, 8, 140),
    toneSummary: cleanText(raw?.toneSummary, 1200) ?? profile.communicationStyle,
    personalitySummary: cleanText(raw?.personalitySummary, 1200) ?? profile.personality,
  };
}

export const getChatImportContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    return {
      userId: user._id,
      mirrorId: mirror._id,
      ownerDisplayName: user.nickname ?? user.name ?? user.email ?? "the owner",
      mirror: {
        name: mirror.name,
        personality: mirror.personality,
        communicationStyle: mirror.communicationStyle,
        interests: mirror.interests,
        goals: mirror.goals,
        thingsToKnow: mirror.thingsToKnow,
      },
    };
  },
});

export const analyzeChatLogImport = action({
  args: {
    chatLog: v.string(),
    ownerHandle: v.optional(v.string()),
    otherHandle: v.optional(v.string()),
    sourceLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const chatLog = args.chatLog.trim();
    if (chatLog.length < 200) {
      throw new ConvexError({
        code: "TOO_SHORT",
        message: "Paste a longer chat log so there is enough signal to learn from.",
      });
    }

    const c = await ctx.runQuery(internal.memories.getChatImportContext, {});
    const truncated = chatLog.length > MAX_CHAT_IMPORT_CHARS;
    const sample = chatLog.slice(0, MAX_CHAT_IMPORT_CHARS);
    const ownerHandle =
      cleanText(args.ownerHandle, 80) ?? c.ownerDisplayName;
    const otherHandle = cleanText(args.otherHandle, 80) ?? "the other person";

    const system = [
      "You extract private Mirror training notes from a pasted human chat log.",
      "The goal is to learn ONLY the owner's tone, interests, recurring topics, values, goals, personality, preferences, communication style, and self-expressed thoughts.",
      "Do not store raw transcript lines. Do not quote more than tiny phrases. Summarise patterns.",
      "Do not create memories about the other person except relationship dynamics from the owner's perspective.",
      "Default every memory to private. Use shareable only for broad, non-sensitive, public-safe facts about the owner.",
      "Do not infer sensitive traits, medical details, political/religious identity, sexuality, financial status, or secrets unless the owner explicitly says they want the Mirror to remember it. Put caution in safetyNotes instead.",
      "If speaker labels are ambiguous, be conservative and say so in safetyNotes.",
    ].join("\n");

    const prompt = [
      `Owner handle/name in this log: ${ownerHandle}`,
      `Other participant: ${otherHandle}`,
      `Source label: ${cleanText(args.sourceLabel, 120) ?? "Pasted chat log"}`,
      "",
      "Current Mirror profile before import:",
      `Mirror name: ${c.mirror.name}`,
      `Current personality: ${c.mirror.personality ?? "(none)"}`,
      `Current communication style: ${c.mirror.communicationStyle ?? "(none)"}`,
      `Current interests: ${c.mirror.interests.join(", ") || "(none)"}`,
      `Current goals: ${c.mirror.goals.join(", ") || "(none)"}`,
      "",
      "Return JSON with:",
      "- toneSummary: how the owner tends to write and sound",
      "- personalitySummary: cautious summary of personality signals",
      "- communicationStyle: concrete style notes for the Mirror",
      "- thingsToKnow: private context the Mirror should know about the owner",
      "- interests: short list",
      "- goals: short list",
      "- topics: recurring topics",
      "- safetyNotes: privacy/ambiguity cautions",
      "- memories: 8-18 concise memory objects with type, visibility, content",
      "",
      "Allowed memory types: fact, preference, goal, project, relationship, boundary, opinion, task.",
      "",
      truncated
        ? `The pasted log was truncated to ${MAX_CHAT_IMPORT_CHARS} characters for analysis.`
        : "",
      "Chat log:",
      sample,
    ]
      .filter(Boolean)
      .join("\n");

    const schema = {
      type: "object",
      properties: {
        toneSummary: { type: "string" },
        personalitySummary: { type: "string" },
        communicationStyle: { type: "string" },
        thingsToKnow: { type: "string" },
        interests: { type: "array", items: { type: "string" } },
        goals: { type: "array", items: { type: "string" } },
        topics: { type: "array", items: { type: "string" } },
        safetyNotes: { type: "array", items: { type: "string" } },
        memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              visibility: { type: "string" },
              content: { type: "string" },
            },
            required: ["type", "visibility", "content"],
          },
        },
      },
      required: [
        "toneSummary",
        "personalitySummary",
        "communicationStyle",
        "thingsToKnow",
        "interests",
        "goals",
        "topics",
        "safetyNotes",
        "memories",
      ],
    };

    const { provider } = await import("./ai/provider");
    const raw = await provider.generateStructured<any>({
      system,
      prompt,
      schema,
      purpose: "chat_import",
      userId: c.userId,
      mirrorId: c.mirrorId,
      maxTokens: 1600,
      temperature: 0.3,
      ctx,
    });

    return {
      ...normaliseImportDraft(raw),
      rawCharacterCount: chatLog.length,
      analyzedCharacterCount: sample.length,
      truncated,
    };
  },
});

export const applyChatLogImport = mutation({
  args: {
    updateProfile: v.boolean(),
    profile: chatImportProfileDraft,
    memories: v.array(chatImportMemoryDraft),
  },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    const now = Date.now();
    let inserted = 0;
    for (const memory of args.memories.slice(0, MAX_IMPORTED_MEMORIES)) {
      const content = memory.content.trim();
      if (!content) continue;
      await ctx.db.insert("memories", {
        userId: user._id,
        mirrorId: mirror._id,
        type: memory.type,
        visibility: memory.visibility,
        content,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }

    if (args.updateProfile) {
      await ctx.db.patch(mirror._id, {
        communicationStyle: appendProfileNote(
          mirror.communicationStyle,
          "Imported chat style",
          args.profile.communicationStyle,
        ),
        personality: appendProfileNote(
          mirror.personality,
          "Imported chat personality",
          args.profile.personality,
        ),
        thingsToKnow: appendProfileNote(
          mirror.thingsToKnow,
          "Imported private chat context",
          args.profile.thingsToKnow,
        ),
        interests: mergeUnique(mirror.interests, args.profile.interests),
        goals: mergeUnique(mirror.goals, args.profile.goals),
        updatedAt: now,
      });
    }

    if (inserted > 0 || args.updateProfile) {
      await ctx.scheduler.runAfter(0, internal.mirrors.generateBehaviourForMirror, {
        mirrorId: mirror._id,
      });
    }

    return { inserted, profileUpdated: args.updateProfile };
  },
});

/**
 * List the caller's memories. Optionally filter by visibility / type and
 * include archived entries.
 */
export const listMyMemories = query({
  args: {
    visibility: v.optional(memoryVisibility),
    type: v.optional(memoryType),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { mirror } = await requireUserAndMirror(ctx);
    let rows = await ctx.db
      .query("memories")
      .withIndex("by_mirror", (q) => q.eq("mirrorId", mirror._id))
      .order("desc")
      .collect();
    if (!args.includeArchived) rows = rows.filter((m) => !m.archived);
    if (args.visibility) rows = rows.filter((m) => m.visibility === args.visibility);
    if (args.type) rows = rows.filter((m) => m.type === args.type);
    return rows;
  },
});

export const addMemory = mutation({
  args: {
    type: memoryType,
    visibility: memoryVisibility,
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: "INVALID", message: "Memory content is empty." });
    }
    const now = Date.now();
    const id = await ctx.db.insert("memories", {
      userId: user._id,
      mirrorId: mirror._id,
      type: args.type,
      visibility: args.visibility,
      content,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
    // Goals feed behaviour & tools — regenerate behaviour to keep the Mirror current.
    await ctx.scheduler.runAfter(0, internal.mirrors.generateBehaviourForMirror, {
      mirrorId: mirror._id,
    });
    return id;
  },
});

export const updateMemory = mutation({
  args: {
    memoryId: v.id("memories"),
    type: v.optional(memoryType),
    visibility: v.optional(memoryVisibility),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your memory." });
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.type !== undefined) patch.type = args.type;
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.content !== undefined) patch.content = args.content.trim();
    await ctx.db.patch(args.memoryId, patch);
    await ctx.scheduler.runAfter(0, internal.mirrors.generateBehaviourForMirror, {
      mirrorId: mirror._id,
    });
    return { ok: true };
  },
});

export const archiveMemory = mutation({
  args: { memoryId: v.id("memories"), archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your memory." });
    }
    await ctx.db.patch(args.memoryId, {
      archived: args.archived ?? true,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const deleteMemory = mutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, args) => {
    const { user } = await requireUserAndMirror(ctx);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your memory." });
    }
    await ctx.db.delete(args.memoryId);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Internal accessors used by the tool system (convex/ai/tools.ts).
// ---------------------------------------------------------------------------

/**
 * Return non-archived memories for a Mirror, optionally constrained to a
 * visibility. CRITICAL: callers requesting cross-Mirror context MUST pass
 * visibility="shareable" — never expose private memory to another Mirror.
 */
export const getMemoriesForMirror = internalQuery({
  args: {
    mirrorId: v.id("mirrors"),
    visibility: v.optional(memoryVisibility),
    types: v.optional(v.array(memoryType)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("memories")
      .withIndex("by_mirror", (q) => q.eq("mirrorId", args.mirrorId))
      .filter((q) => q.eq(q.field("archived"), false))
      .order("desc")
      .collect();
    if (args.visibility) rows = rows.filter((m) => m.visibility === args.visibility);
    if (args.types && args.types.length > 0) {
      rows = rows.filter((m) => args.types!.includes(m.type));
    }
    if (args.limit) rows = rows.slice(0, args.limit);
    return rows;
  },
});

/**
 * Naive keyword "search" over a Mirror's memories. This is the MVP stand-in for
 * vector search; the signature is intentionally compatible with a future
 * embedding-based implementation (see schema.ts vector index note).
 */
export const searchMemories = internalQuery({
  args: {
    mirrorId: v.id("mirrors"),
    queryText: v.string(),
    visibility: v.optional(memoryVisibility),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("memories")
      .withIndex("by_mirror", (q) => q.eq("mirrorId", args.mirrorId))
      .filter((q) => q.eq(q.field("archived"), false))
      .collect();
    if (args.visibility) rows = rows.filter((m) => m.visibility === args.visibility);

    const terms = args.queryText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const scored = rows
      .map((m) => {
        const text = m.content.toLowerCase();
        const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
        return { memory: m, score };
      })
      .sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt);

    const hits = scored.filter((s) => s.score > 0).map((s) => s.memory);
    const result = hits.length > 0 ? hits : rows.sort((a, b) => b.createdAt - a.createdAt);
    return result.slice(0, args.limit ?? 8);
  },
});
