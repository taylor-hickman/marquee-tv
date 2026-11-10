// The model adapter (architecture 6.4, ADR 0008). The provider SDK stays in this
// file: nothing it exports names an SDK type (PRD 8.5).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { fakeTransport, type FakeScript } from "./fake";

export const EXTRACT_BRIEF_MODEL = "claude-haiku-5-5";
export const COMPOSE_MODEL = "claude-sonnet-5-5";

const MAX_TOKENS = { extractBrief: 1024, compose: 2048 } as const;
// Below the run's 20 s ceiling, which the caller sets through `signal`.
const DEFAULT_TIMEOUT_MS = 20_000;

export type LlmFunction = "extractBrief" | "compose";
export type LlmError = "schema" | "timeout" | "provider";

// `system` is the fixed prompt and is cached, so it must stay byte-identical
// between requests. Everything that varies goes in `user`.
export type LlmInput = { system: string; user: string };

export type CallOptions = { signal?: AbortSignal; timeoutMs?: number };

// One model request. The caller sums these into its curator_run row.
// tokensIn counts every input token, cached or not.
export type CallRecord = {
  fn: LlmFunction;
  attempt: 1 | 2;
  model: string;
  outcome: "ok" | LlmError;
  tokensIn: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  tokensOut: number;
  latencyMs: number;
};

export type LlmResult<T> =
  | { ok: true; output: T; calls: CallRecord[] }
  | { ok: false; error: LlmError; calls: CallRecord[] };

type Call = <T>(
  input: LlmInput,
  schema: z.ZodType<T>,
  options?: CallOptions,
) => Promise<LlmResult<T>>;

export type LlmAdapter = { extractBrief: Call; compose: Call };

// What a transport returns for one request. `text` is the raw JSON the model wrote.
export type Reply = {
  model: string;
  text: string;
  stop: "end" | "max_tokens" | "refusal";
  usage: Omit<CallRecord, "fn" | "attempt" | "model" | "outcome" | "latencyMs">;
};

export type Transport = (request: {
  fn: LlmFunction;
  input: LlmInput;
  schema: z.ZodType;
  signal: AbortSignal;
}) => Promise<Reply | { error: "timeout" | "provider" }>;

const noUsage = {
  tokensIn: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  tokensOut: 0,
};

function parse<T>(schema: z.ZodType<T>, reply: Reply) {
  if (reply.stop !== "end") return undefined;
  try {
    const result = schema.safeParse(JSON.parse(reply.text));
    return result.success ? { value: result.data } : undefined;
  } catch {
    return undefined;
  }
}

// One retry on a schema failure (architecture 6.2 step 4); a timeout or provider
// error ends the call. The timeout covers both attempts.
function createAdapter(
  transport: Transport,
  models: Record<LlmFunction, string>,
  now: () => number = Date.now,
): LlmAdapter {
  const call =
    (fn: LlmFunction): Call =>
    async (input, schema, options = {}) => {
      const timeout = AbortSignal.timeout(
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      const calls: CallRecord[] = [];

      for (const attempt of [1, 2] as const) {
        const started = now();
        const record = { fn, attempt, model: models[fn] };
        const reply = await transport({ fn, input, schema, signal });
        const latencyMs = now() - started;
        if ("error" in reply) {
          calls.push({
            ...record,
            outcome: reply.error,
            ...noUsage,
            latencyMs,
          });
          return { ok: false, error: reply.error, calls };
        }
        const base = { ...record, model: reply.model, ...reply.usage };
        if (reply.stop === "refusal") {
          calls.push({ ...base, outcome: "provider", latencyMs });
          return { ok: false, error: "provider", calls };
        }
        const parsed = parse(schema, reply);
        calls.push({ ...base, outcome: parsed ? "ok" : "schema", latencyMs });
        if (parsed) return { ok: true, output: parsed.value, calls };
      }
      return { ok: false, error: "schema", calls };
    };

  return { extractBrief: call("extractBrief"), compose: call("compose") };
}

const MODELS = { extractBrief: EXTRACT_BRIEF_MODEL, compose: COMPOSE_MODEL };

// Thinking off on both calls (ADR 0008). Sonnet 5.5 rejects `disabled`, so
// compose sends `between_tools`, which is thinking off for a call with no tools.
const THINKING = {
  extractBrief: { type: "disabled" },
  compose: { type: "between_tools" },
} as const;

const STOP: Record<string, Reply["stop"] | undefined> = {
  end_turn: "end",
  max_tokens: "max_tokens",
  refusal: "refusal",
};

export function createAnthropicAdapter(
  options: { apiKey?: string; maxRetries?: number; now?: () => number } = {},
): LlmAdapter {
  let client: Anthropic | undefined;
  const transport: Transport = async ({ fn, input, schema, signal }) => {
    try {
      client ??= new Anthropic({
        apiKey: options.apiKey,
        maxRetries: options.maxRetries,
      });
      const message = await client.messages.create(
        {
          model: MODELS[fn],
          max_tokens: MAX_TOKENS[fn],
          thinking: THINKING[fn],
          system: [
            {
              type: "text",
              text: input.system,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: input.user }],
          output_config: { format: zodOutputFormat(schema) },
        },
        { signal },
      );
      const read = message.usage.cache_read_input_tokens ?? 0;
      const write = message.usage.cache_creation_input_tokens ?? 0;
      return {
        model: message.model,
        text: message.content
          .map((block) => (block.type === "text" ? block.text : ""))
          .join(""),
        // Any other stop (stop_sequence, pause_turn) is not a finished output.
        stop: STOP[message.stop_reason ?? ""] ?? "max_tokens",
        usage: {
          tokensIn: message.usage.input_tokens + read + write,
          cacheReadTokens: read,
          cacheWriteTokens: write,
          tokensOut: message.usage.output_tokens,
        },
      };
    } catch (error) {
      const timedOut =
        error instanceof Anthropic.APIUserAbortError ||
        error instanceof Anthropic.APIConnectionTimeoutError;
      return { error: timedOut ? "timeout" : "provider" };
    }
  };
  return createAdapter(transport, MODELS, options.now);
}

// Canned or scripted output with no key (build plan 6.1). Unscripted calls get
// the example from src/contracts/examples.ts that fits the caller's schema.
export function createFakeAdapter(script?: FakeScript): LlmAdapter {
  return createAdapter(fakeTransport(script), {
    extractBrief: "fake",
    compose: "fake",
  });
}

type Env = Record<string, string | undefined>;

export function selectAdapter(env: Env = process.env): LlmAdapter {
  if (env.LLM_ADAPTER === "fake") {
    if (env.VERCEL_ENV === "production") {
      throw new Error("LLM_ADAPTER=fake is refused when VERCEL_ENV=production");
    }
    return createFakeAdapter();
  }
  return createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY });
}

let selected: LlmAdapter | undefined;

// Small model: prompt text, chips, seeds and pins in; a brief or brief delta out.
export const extractBrief: Call = (input, schema, options) =>
  (selected ??= selectAdapter()).extractBrief(input, schema, options);

// Main model: brief and candidate rows in; an ordered list or ops out.
export const compose: Call = (input, schema, options) =>
  (selected ??= selectAdapter()).compose(input, schema, options);
