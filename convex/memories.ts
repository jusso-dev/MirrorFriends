import { query, mutation, internalQuery } from "./_generated/server";
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
