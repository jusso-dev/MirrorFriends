import { ActionCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { OpenAIProvider } from "./openai";

// ---------------------------------------------------------------------------
// AI provider abstraction.
//
// The browser app NEVER calls a model provider directly. Every model call goes
// through a Convex action which uses this abstraction. Swapping providers (or
// adding Anthropic / Gemini / OpenRouter / Ollama) means implementing this one
// interface and changing the `provider` export below — nothing else changes.
// ---------------------------------------------------------------------------

export type AIPurpose =
  | "daily_conversation"
  | "manual_prompt"
  | "behaviour_generation"
  | "chat_import"
  | "conversation_seed"
  | "weekly_summary";

export interface AIUsageMeta {
  /** For cost/usage logging. Optional because some calls are system-level. */
  userId?: Id<"users">;
  mirrorId?: Id<"mirrors">;
  purpose: AIPurpose;
  /**
   * The action context — passed so the provider can log usage via an internal
   * mutation after the call resolves.
   */
  ctx: ActionCtx;
}

export interface GenerateTextInput extends AIUsageMeta {
  system: string;
  prompt: string;
  /** Optional prior turns for multi-message context. */
  messages?: { role: "user" | "assistant" | "system"; content: string }[];
  /**
   * Enables provider-hosted tools for this call. Keep this false for friend
   * conversations unless the caller has a clear privacy-safe reason to search.
   */
  allowWebSearch?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface WebSearchSource {
  title: string;
  url: string;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  sources?: WebSearchSource[];
}

export interface GenerateStructuredInput<T> extends AIUsageMeta {
  system: string;
  prompt: string;
  /**
   * JSON schema describing the expected object (OpenAI structured outputs /
   * JSON mode). The provider is responsible for parsing + validating.
   */
  schema: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  /** Phantom field for generic inference; never set at runtime. */
  __resultType?: T;
}

export interface AIProvider {
  readonly name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T>;
}

/**
 * Shared usage logger. Providers call this after each request so all model
 * usage lands in the `aiUsage` table regardless of provider.
 */
export async function logUsage(
  ctx: ActionCtx,
  args: {
    userId?: Id<"users">;
    mirrorId?: Id<"mirrors">;
    provider: string;
    model: string;
    purpose: AIPurpose;
    inputTokens?: number;
    outputTokens?: number;
  },
): Promise<void> {
  await ctx.runMutation(internal.ai_internal.logAiUsage, args);
}

// The active provider. Default: OpenAI. To add another provider later, branch
// on a feature flag / env var here.
export const provider: AIProvider = new OpenAIProvider();
