// Runs every case in cases.ts through the real small model and returns what it
// wrote, for recorded.json. The key is readable only inside a deployment
// (docs/ops/provisioning.md, "Checking a stored secret"), so this runs from a
// throwaway preview function that calls `record()` and returns its result.
// Re-record whenever prompt.ts or cases.ts changes.
import {
  createAnthropicAdapter,
  EXTRACT_BRIEF_MODEL,
  type LlmAdapter,
} from "../llm";
import { cases, context, current, list } from "./cases";
import { extractBrief, extractRefineBrief } from "./index";

export type Recording = {
  model: string;
  recordedAt: string;
  outputs: Record<string, unknown>;
  calls: Record<
    string,
    { tokensIn: number; tokensOut: number; latencyMs: number }
  >;
};

export async function record(apiKey: string): Promise<Recording> {
  const real = createAnthropicAdapter({ apiKey });
  const recording: Recording = {
    model: EXTRACT_BRIEF_MODEL,
    recordedAt: new Date().toISOString(),
    outputs: {},
    calls: {},
  };
  for (const c of cases) {
    const llm: Pick<LlmAdapter, "extractBrief"> = {
      extractBrief: async (input, schema, options) => {
        const result = await real.extractBrief(input, schema, options);
        const last = result.calls.at(-1);
        if (result.ok) recording.outputs[c.id] = result.output;
        if (last)
          recording.calls[c.id] = {
            tokensIn: last.tokensIn,
            tokensOut: last.tokensOut,
            latencyMs: last.latencyMs,
          };
        return result;
      },
    };
    if (c.kind === "generate") await extractBrief(c.input, context, { llm });
    else
      await extractRefineBrief(
        { instruction: c.instruction, brief: current, list },
        context,
        { llm },
      );
  }
  return recording;
}
