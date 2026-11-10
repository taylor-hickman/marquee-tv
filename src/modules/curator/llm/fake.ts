// The fake LLM adapter's transport (build plan 6.1, 6.2). LLM_ADAPTER=fake selects
// it so e2e runs need no key; tests script it to drive the curator's repair rules.
import type { z } from "zod";
import { examples } from "@/contracts/examples";
import type { LlmFunction, LlmInput, Transport } from "./index";

// What the model "wrote": any value, serialized and parsed against the caller's
// schema like a real reply, or a typed error.
export type FakeReply = { output: unknown } | { error: "timeout" | "provider" };

export type FakeScript = Partial<
  Record<LlmFunction, (input: LlmInput, schema: z.ZodType) => FakeReply>
>;

const canned: Record<LlmFunction, unknown[]> = {
  extractBrief: [examples.brief, { delta: examples.brief, scope: null }],
  compose: [examples.composeOutput, examples.refineOutput],
};

function cannedFor(fn: LlmFunction, schema: z.ZodType): FakeReply {
  const output = canned[fn].find((c) => schema.safeParse(c).success);
  return { output: output ?? null };
}

const usage = {
  tokensIn: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  tokensOut: 0,
};

export function fakeTransport(script: FakeScript = {}): Transport {
  return async ({ fn, input, schema }) => {
    const reply = script[fn]?.(input, schema) ?? cannedFor(fn, schema);
    if ("error" in reply) return reply;
    return {
      model: "fake",
      text: JSON.stringify(reply.output) ?? "",
      stop: "end",
      usage,
    };
  };
}
