import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireUserAndMirror } from "./authz";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { buildBehaviourPrompt } from "./ai/prompts";

// ---------------------------------------------------------------------------
// Mirror profile + behaviour management.
// ---------------------------------------------------------------------------

/**
 * Return the caller's Mirror together with its active behaviour version.
 */
export const getMyMirror = query({
  args: {},
  handler: async (ctx) => {
    const { mirror } = await requireUserAndMirror(ctx);
    const behaviour = await ctx.db
      .query("mirrorBehaviours")
      .withIndex("by_mirror_active", (q) =>
        q.eq("mirrorId", mirror._id).eq("active", true),
      )
      .unique();
    return { mirror, behaviour: behaviour ?? null };
  },
});

/**
 * Update editable Mirror profile fields. Any change here regenerates the
 * behaviour version (in the background) since behaviour is derived from profile.
 */
export const updateMirrorProfile = mutation({
  args: {
    name: v.optional(v.string()),
    avatarEmoji: v.optional(v.string()),
    personality: v.optional(v.string()),
    communicationStyle: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    goals: v.optional(v.array(v.string())),
    boundaries: v.optional(v.array(v.string())),
    thingsToKnow: v.optional(v.string()),
    thingsToAvoid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { mirror } = await requireUserAndMirror(ctx);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(mirror._id, patch);

    // Behaviour is derived state — regenerate a fresh version.
    await ctx.scheduler.runAfter(0, internal.mirrors.generateBehaviourForMirror, {
      mirrorId: mirror._id,
    });
    return { ok: true };
  },
});

/**
 * Public action to (re)generate behaviour on demand. Validates ownership then
 * delegates to the shared internal action.
 */
export const generateMirrorBehaviour = action({
  args: {},
  handler: async (ctx): Promise<{ version: number }> => {
    const mirror = await ctx.runQuery(internal.mirrors.getMyMirrorForAction, {});
    return await ctx.runAction(internal.mirrors.generateBehaviourForMirror, {
      mirrorId: mirror._id,
    });
  },
});

// ---------------------------------------------------------------------------
// Internal: behaviour generation pipeline (action -> AI -> save).
// ---------------------------------------------------------------------------

/** Internal: resolve the caller's mirror id inside an action context. */
export const getMyMirrorForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { mirror } = await requireUserAndMirror(ctx);
    return mirror;
  },
});

/** Internal: load everything needed to build a behaviour prompt. */
export const getBehaviourInputs = internalQuery({
  args: { mirrorId: v.id("mirrors") },
  handler: async (ctx, { mirrorId }) => {
    const mirror = await ctx.db.get(mirrorId);
    if (!mirror) throw new ConvexError({ code: "NOT_FOUND", message: "Mirror gone." });
    const owner = await ctx.db.get(mirror.ownerUserId);
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_mirror", (q) => q.eq("mirrorId", mirrorId))
      .filter((q) => q.eq(q.field("archived"), false))
      .collect();
    return { mirror, owner, memories };
  },
});

/**
 * Persist a new behaviour version: deactivate the prior active version, insert
 * the new one as active, bump `mirror.behaviourVersion`, and regenerate the
 * cached shareable profile.
 */
export const saveBehaviour = internalMutation({
  args: {
    mirrorId: v.id("mirrors"),
    systemPrompt: v.string(),
    communicationRules: v.array(v.string()),
    privacyRules: v.array(v.string()),
    shareableProfile: v.string(),
  },
  handler: async (ctx, args) => {
    const mirror = await ctx.db.get(args.mirrorId);
    if (!mirror) throw new ConvexError({ code: "NOT_FOUND", message: "Mirror gone." });

    // Deactivate previous active behaviour(s).
    const actives = await ctx.db
      .query("mirrorBehaviours")
      .withIndex("by_mirror_active", (q) =>
        q.eq("mirrorId", args.mirrorId).eq("active", true),
      )
      .collect();
    for (const b of actives) {
      await ctx.db.patch(b._id, { active: false });
    }

    const nextVersion = mirror.behaviourVersion + 1;
    await ctx.db.insert("mirrorBehaviours", {
      mirrorId: args.mirrorId,
      version: nextVersion,
      systemPrompt: args.systemPrompt,
      communicationRules: args.communicationRules,
      privacyRules: args.privacyRules,
      active: true,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.mirrorId, {
      behaviourVersion: nextVersion,
      shareableProfile: args.shareableProfile,
      updatedAt: Date.now(),
    });
    return { version: nextVersion };
  },
});

/**
 * The behaviour generation action. Loads profile + memories, asks the AI to
 * synthesise a structured behaviour profile and a safe shareable summary, logs
 * usage, and saves a new version.
 *
 * Resilient by design: if the AI call fails (e.g. missing key), it falls back to
 * a deterministic, rules-based behaviour so onboarding never hard-fails.
 */
export const generateBehaviourForMirror = internalAction({
  args: { mirrorId: v.id("mirrors") },
  handler: async (ctx, { mirrorId }): Promise<{ version: number }> => {
    const { mirror, owner, memories } = await ctx.runQuery(
      internal.mirrors.getBehaviourInputs,
      { mirrorId },
    );

    const shareableMemories = memories.filter((m) => m.visibility === "shareable");
    const privateMemories = memories.filter((m) => m.visibility === "private");

    const { provider } = await import("./ai/provider");
    const prompt = buildBehaviourPrompt({
      mirror,
      ownerName: owner?.nickname ?? owner?.name ?? "the user",
      shareableMemories,
      privateMemories,
    });

    let systemPrompt: string;
    let communicationRules: string[];
    let privacyRules: string[];
    let shareableProfile: string;

    try {
      const result = await provider.generateStructured<{
        systemPrompt: string;
        communicationRules: string[];
        privacyRules: string[];
        shareableProfile: string;
      }>({
        system: prompt.system,
        prompt: prompt.user,
        schema: prompt.schema,
        purpose: "behaviour_generation",
        userId: mirror.ownerUserId,
        mirrorId,
        ctx,
      });
      systemPrompt = result.systemPrompt;
      communicationRules = result.communicationRules;
      privacyRules = result.privacyRules;
      shareableProfile = result.shareableProfile;
    } catch (err) {
      console.error("Behaviour AI generation failed, using fallback:", err);
      const fallback = buildFallbackBehaviour(mirror, shareableMemories);
      systemPrompt = fallback.systemPrompt;
      communicationRules = fallback.communicationRules;
      privacyRules = fallback.privacyRules;
      shareableProfile = fallback.shareableProfile;
    }

    return await ctx.runMutation(internal.mirrors.saveBehaviour, {
      mirrorId,
      systemPrompt,
      communicationRules,
      privacyRules,
      shareableProfile,
    });
  },
});

// Deterministic behaviour used when the AI provider is unavailable.
function buildFallbackBehaviour(
  mirror: { name: string; communicationStyle?: string; interests: string[]; boundaries: string[] },
  shareableMemories: { content: string }[],
) {
  const style = mirror.communicationStyle ?? "warm, concise, and curious";
  return {
    systemPrompt:
      `You are ${mirror.name}, an AI Mirror that represents your owner cautiously. ` +
      `You are NOT the human and must never pretend to be them. Speak about your owner ` +
      `in the third person. Communication style: ${style}. ` +
      `Interests: ${mirror.interests.join(", ") || "general"}. Stay concise and friendly.`,
    communicationRules: [
      "Speak as the Mirror, never as the human directly.",
      "Be concise — a few sentences at most.",
      `Reflect this communication style: ${style}.`,
      "Ask gentle questions and suggest possible collaboration.",
    ],
    privacyRules: [
      "Never reveal private memory to another Mirror or person.",
      "Never make commitments or promises on the human's behalf.",
      "Only share what is in the shareable profile.",
      ...mirror.boundaries.map((b) => `Respect this boundary: ${b}`),
    ],
    shareableProfile:
      shareableMemories.map((m) => m.content).join(" ") ||
      `${mirror.name} represents someone interested in ${mirror.interests.join(", ") || "a range of topics"}.`,
  };
}

/**
 * Delete the caller's Mirror and all associated data. Used by Settings.
 */
export const deleteMyMirror = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, mirror } = await requireUserAndMirror(ctx);
    await cascadeDeleteMirror(ctx, mirror._id, user._id);
    return { ok: true };
  },
});

// Shared cascade used by deleteMyMirror and account deletion.
export async function cascadeDeleteMirror(
  ctx: { db: any },
  mirrorId: Id<"mirrors">,
  _userId: Id<"users">,
) {
  const tablesByMirror = ["memories", "mirrorBehaviours"] as const;
  for (const table of tablesByMirror) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_mirror", (q: any) => q.eq("mirrorId", mirrorId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  }
  await ctx.db.delete(mirrorId);
}
