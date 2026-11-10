import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { brief, composeOutput, refineBrief } from "@/contracts";
import { examples } from "@/contracts/examples";
import {
  COMPOSE_MODEL,
  createAnthropicAdapter,
  createFakeAdapter,
  EXTRACT_BRIEF_MODEL,
  selectAdapter,
} from "./index";

const MESSAGES = "https://api.anthropic.com/v1/messages";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const input = { system: "fixed system prompt", user: "per-request content" };
const valid = examples.composeOutput;

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

function message(
  output: unknown,
  {
    stop = "end_turn",
    usage = {},
  }: { stop?: string; usage?: Partial<Usage> } = {},
) {
  return HttpResponse.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: COMPOSE_MODEL,
    content: [
      {
        type: "text",
        text: typeof output === "string" ? output : JSON.stringify(output),
      },
    ],
    stop_reason: stop,
    stop_details: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      ...usage,
    },
  });
}

// Answers each request with the next reply and keeps every request body.
function replies(...queue: Array<() => Response | Promise<Response>>) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(MESSAGES, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      const next = queue.shift();
      if (!next) throw new Error("more requests than replies");
      return next();
    }),
  );
  return bodies;
}

const adapter = (now?: () => number) =>
  createAnthropicAdapter({ apiKey: "test-key", maxRetries: 0, now });

describe("anthropic adapter", () => {
  test("a valid response comes back parsed, from the compose model", async () => {
    const bodies = replies(() => message(valid));

    const result = await adapter().compose(input, composeOutput);

    expect(result).toMatchObject({ ok: true, output: valid });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      model: COMPOSE_MODEL,
      thinking: { type: "between_tools" },
      output_config: { format: { type: "json_schema" } },
      messages: [{ role: "user", content: input.user }],
    });
  });

  test("the fixed system prompt comes first and carries the cache breakpoint", async () => {
    const bodies = replies(() => message(examples.brief));

    const result = await adapter().extractBrief(input, brief);

    expect(result.ok).toBe(true);
    expect(bodies[0]).toMatchObject({
      model: EXTRACT_BRIEF_MODEL,
      thinking: { type: "disabled" },
      system: [
        {
          type: "text",
          text: input.system,
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  });

  test("a schema failure is retried once and the retry's output returned", async () => {
    const bodies = replies(
      () => message({ ids: [], title: "" }),
      () => message(valid),
    );

    const result = await adapter().compose(input, composeOutput);

    expect(result).toMatchObject({ ok: true, output: valid });
    expect(bodies).toHaveLength(2);
    expect(result.calls.map((c) => [c.attempt, c.outcome])).toEqual([
      [1, "schema"],
      [2, "ok"],
    ]);
  });

  test("a second schema failure surfaces as a schema error", async () => {
    const bodies = replies(
      () => message("not json"),
      () => message({ ids: ["x"] }),
    );

    const result = await adapter().compose(input, composeOutput);

    expect(result).toMatchObject({ ok: false, error: "schema" });
    expect(bodies).toHaveLength(2);
    expect(result.calls.map((c) => c.outcome)).toEqual(["schema", "schema"]);
  });

  test("a max_tokens stop is a schema failure, never parsed", async () => {
    replies(
      () => message(valid, { stop: "max_tokens" }),
      () => message(valid, { stop: "max_tokens" }),
    );

    const result = await adapter().compose(input, composeOutput);

    expect(result).toMatchObject({ ok: false, error: "schema" });
    expect(result.calls).toHaveLength(2);
  });

  test("a refusal is a provider error and is not retried", async () => {
    const bodies = replies(() => message(valid, { stop: "refusal" }));

    const result = await adapter().compose(input, composeOutput);

    expect(result).toMatchObject({ ok: false, error: "provider" });
    expect(bodies).toHaveLength(1);
  });

  test("an API error is a provider error", async () => {
    replies(() =>
      HttpResponse.json(
        { type: "error", error: { type: "overloaded_error", message: "x" } },
        { status: 529 },
      ),
    );

    const result = await adapter().compose(input, composeOutput);

    expect(result).toMatchObject({ ok: false, error: "provider" });
    expect(result.calls).toHaveLength(1);
  });

  test("a call that outlasts timeoutMs is a timeout error", async () => {
    replies(async () => {
      await delay("infinite");
      return message(valid);
    });

    const result = await adapter().compose(input, composeOutput, {
      timeoutMs: 50,
    });

    expect(result).toMatchObject({ ok: false, error: "timeout" });
    expect(result.calls).toMatchObject([{ outcome: "timeout", tokensIn: 0 }]);
  });

  test("the caller's abort signal ends the call as a timeout", async () => {
    replies(async () => {
      await delay("infinite");
      return message(valid);
    });
    const ceiling = new AbortController();
    setTimeout(() => ceiling.abort(), 20);

    const result = await adapter().extractBrief(input, brief, {
      signal: ceiling.signal,
    });

    expect(result).toMatchObject({ ok: false, error: "timeout" });
  });

  test("token accounting: each call records model, tokens and latency", async () => {
    replies(
      () =>
        message("{}", {
          usage: {
            input_tokens: 4000,
            cache_creation_input_tokens: 1500,
            cache_read_input_tokens: 0,
            output_tokens: 20,
          },
        }),
      () =>
        message(valid, {
          usage: {
            input_tokens: 4000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 1500,
            output_tokens: 400,
          },
        }),
    );
    const ticks = [1000, 1700, 2000, 4400];

    const result = await adapter(() => ticks.shift()!).compose(
      input,
      composeOutput,
    );

    expect(result.calls).toEqual([
      {
        fn: "compose",
        attempt: 1,
        model: COMPOSE_MODEL,
        outcome: "schema",
        tokensIn: 5500,
        cacheReadTokens: 0,
        cacheWriteTokens: 1500,
        tokensOut: 20,
        latencyMs: 700,
      },
      {
        fn: "compose",
        attempt: 2,
        model: COMPOSE_MODEL,
        outcome: "ok",
        tokensIn: 5500,
        cacheReadTokens: 1500,
        cacheWriteTokens: 0,
        tokensOut: 400,
        latencyMs: 2400,
      },
    ]);
  });
});

describe("fake adapter", () => {
  test("returns canned output that fits the caller's schema", async () => {
    const fake = createFakeAdapter();

    expect(await fake.extractBrief(input, brief)).toMatchObject({
      ok: true,
      output: examples.brief,
    });
    expect(await fake.extractBrief(input, refineBrief)).toMatchObject({
      ok: true,
    });
    expect(await fake.compose(input, composeOutput)).toMatchObject({
      ok: true,
      output: valid,
      calls: [{ model: "fake", outcome: "ok" }],
    });
  });

  test("scripted output goes through the same schema retry", async () => {
    const outputs: unknown[] = [{ ids: [] }, valid];
    const fake = createFakeAdapter({
      compose: () => ({ output: outputs.shift() }),
    });

    const result = await fake.compose(input, composeOutput);

    expect(result).toMatchObject({ ok: true, output: valid });
    expect(result.calls.map((c) => c.outcome)).toEqual(["schema", "ok"]);
  });

  test("a scripted error comes back typed", async () => {
    const fake = createFakeAdapter({ compose: () => ({ error: "timeout" }) });

    expect(await fake.compose(input, composeOutput)).toMatchObject({
      ok: false,
      error: "timeout",
    });
  });
});

describe("adapter selection", () => {
  test("LLM_ADAPTER=fake selects the fake", async () => {
    const llm = selectAdapter({ LLM_ADAPTER: "fake", VERCEL_ENV: "preview" });

    const result = await llm.compose(input, composeOutput);

    expect(result.calls[0]?.model).toBe("fake");
  });

  test("the fake is refused when VERCEL_ENV=production", () => {
    expect(() =>
      selectAdapter({ LLM_ADAPTER: "fake", VERCEL_ENV: "production" }),
    ).toThrow(/production/);
  });

  test("without LLM_ADAPTER the Anthropic adapter is used", async () => {
    replies(() => message(valid));

    const llm = selectAdapter({ ANTHROPIC_API_KEY: "test-key" });
    const result = await llm.compose(input, composeOutput);

    expect(result.calls[0]?.model).toBe(COMPOSE_MODEL);
  });
});
