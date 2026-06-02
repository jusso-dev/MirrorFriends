import OpenAI from "openai";
import {
  AIProvider,
  GenerateTextInput,
  GenerateTextResult,
  GenerateStructuredInput,
  logUsage,
} from "./provider";

// ---------------------------------------------------------------------------
// OpenAI provider implementation.
//
// Reads OPENAI_API_KEY (and optional OPENAI_MODEL) from the Convex environment.
// Designed to run inside a Convex action (Node-compatible runtime). All token
// usage is logged through the shared `logUsage` helper.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Approximate per-1K-token pricing (USD) for cost estimates only. Update freely.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4o": { in: 0.005, out: 0.015 },
  "gpt-4.1-mini": { in: 0.0004, out: 0.0016 },
};

function estimateCost(model: string, inT = 0, outT = 0): number {
  const p = PRICING[model] ?? PRICING[DEFAULT_MODEL] ?? { in: 0, out: 0 };
  return (inT / 1000) * p.in + (outT / 1000) * p.out;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Configure it in the Convex dashboard.",
      );
    }
    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const client = this.getClient();
    const model = DEFAULT_MODEL;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: input.system },
      ...(input.messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      })) as OpenAI.Chat.ChatCompletionMessageParam[],
      { role: "user", content: input.prompt },
    ];

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: input.temperature ?? 0.8,
      max_tokens: input.maxTokens ?? 600,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const inputTokens = completion.usage?.prompt_tokens;
    const outputTokens = completion.usage?.completion_tokens;

    await logUsage(input.ctx, {
      userId: input.userId,
      mirrorId: input.mirrorId,
      provider: this.name,
      model,
      purpose: input.purpose,
      inputTokens,
      outputTokens,
    });

    return { text, model, inputTokens, outputTokens };
  }

  async generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T> {
    const client = this.getClient();
    const model = DEFAULT_MODEL;

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: input.system },
        {
          role: "user",
          content:
            input.prompt +
            "\n\nRespond with ONLY a JSON object matching this schema:\n" +
            JSON.stringify(input.schema),
        },
      ],
      temperature: input.temperature ?? 0.5,
      max_tokens: input.maxTokens ?? 900,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    await logUsage(input.ctx, {
      userId: input.userId,
      mirrorId: input.mirrorId,
      provider: this.name,
      model,
      purpose: input.purpose,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    });

    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      throw new Error(`Failed to parse structured AI output: ${raw.slice(0, 200)}`);
    }
  }
}

export { estimateCost };
