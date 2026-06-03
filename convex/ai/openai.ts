import OpenAI from "openai";
import {
  AIProvider,
  GenerateTextInput,
  GenerateTextResult,
  GenerateStructuredInput,
  WebSearchSource,
  logUsage,
} from "./provider";

// ---------------------------------------------------------------------------
// OpenAI provider implementation.
//
// Reads OPENAI_API_KEY (and optional OPENAI_MODEL) from the Convex environment.
// Designed to run inside a Convex action (Node-compatible runtime). All token
// usage is logged through the shared `logUsage` helper.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const WEB_SEARCH_CONTEXT_SIZE = parseWebSearchContextSize(
  process.env.OPENAI_WEB_SEARCH_CONTEXT_SIZE,
);

// Approximate per-1K-token pricing (USD) for cost estimates only. Update freely.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4o": { in: 0.005, out: 0.015 },
  "gpt-4.1-mini": { in: 0.0004, out: 0.0016 },
  "gpt-5.4-mini": { in: 0.00075, out: 0.0045 },
};

function estimateCost(model: string, inT = 0, outT = 0): number {
  const p = PRICING[model] ?? PRICING[DEFAULT_MODEL] ?? { in: 0, out: 0 };
  return (inT / 1000) * p.in + (outT / 1000) * p.out;
}

function usesMaxCompletionTokens(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.startsWith("gpt-5") || normalized.startsWith("o");
}

function chatCompletionOptions(
  model: string,
  maxTokens: number,
  temperature: number,
): {
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
} {
  if (usesMaxCompletionTokens(model)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens, temperature };
}

function responsesOptions(
  model: string,
  maxTokens: number,
  temperature: number,
): {
  max_output_tokens: number;
  temperature?: number;
} {
  if (usesMaxCompletionTokens(model)) {
    return { max_output_tokens: maxTokens };
  }
  return { max_output_tokens: maxTokens, temperature };
}

function parseWebSearchContextSize(
  value?: string,
): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

function buildWebSearchPolicy(system: string): string {
  return [
    system,
    "",
    "Web search is available only for public, current, or externally verifiable facts. " +
      "Do not search for private memories, personal details, secrets, or anything that " +
      "could identify the owner beyond what the owner explicitly asked you to search. " +
      "When web search is used, include concise source URLs in the answer.",
  ].join("\n");
}

function extractResponseSources(response: unknown): WebSearchSource[] {
  const output = Array.isArray((response as any)?.output)
    ? (response as any).output
    : [];
  const byUrl = new Map<string, WebSearchSource>();
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type !== "output_text" || !Array.isArray(content.annotations)) continue;
      for (const annotation of content.annotations) {
        if (annotation?.type !== "url_citation" || !annotation.url) continue;
        byUrl.set(annotation.url, {
          title: annotation.title || annotation.url,
          url: annotation.url,
        });
      }
    }
  }
  return Array.from(byUrl.values());
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

    if (input.allowWebSearch) {
      const priorMessages = input.messages ?? [];
      const extraSystem = priorMessages
        .filter((m) => m.role === "system")
        .map((m) => m.content);
      const response = await client.responses.create({
        model: model as any,
        instructions: buildWebSearchPolicy([input.system, ...extraSystem].join("\n\n")),
        input: [
          ...priorMessages
            .filter((m) => m.role !== "system")
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
          { role: "user", content: input.prompt },
        ] as any,
        tools: [
          {
            type: "web_search_preview",
            search_context_size: WEB_SEARCH_CONTEXT_SIZE,
          },
        ],
        tool_choice: "auto",
        ...responsesOptions(model, input.maxTokens ?? 600, input.temperature ?? 0.8),
      });

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;

      await logUsage(input.ctx, {
        userId: input.userId,
        mirrorId: input.mirrorId,
        provider: this.name,
        model,
        purpose: input.purpose,
        inputTokens,
        outputTokens,
      });

      return {
        text: response.output_text ?? "",
        model,
        inputTokens,
        outputTokens,
        sources: extractResponseSources(response),
      };
    }

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
      ...chatCompletionOptions(model, input.maxTokens ?? 600, input.temperature ?? 0.8),
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
      ...chatCompletionOptions(model, input.maxTokens ?? 900, input.temperature ?? 0.5),
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
