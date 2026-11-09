# 0008. Anthropic, with Claude Haiku 5.5 for the brief and Claude Sonnet 5.5 for composition

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 2, 6.2 (pipeline, latency and token budgets), 6.3, 6.4, 9.3, 9.5, 12 row 5; PRD 8.4, 8.5, 13, 16.2; build plan T0, B1
- Sources, fetched 2026-11-08 (prices in USD per million tokens):
  - Anthropic, [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - Anthropic, [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
  - Anthropic, [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  - Anthropic, [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
  - OpenAI, [API pricing](https://developers.openai.com/api/docs/pricing)
  - Google, [Gemini API pricing](https://aistudio.google.com/docs/pricing)

## Context

Each generation makes two model calls (ADR 0003): brief extraction on a small model, then composition on a main model. Architecture 6.4 sets the requirements:

1. Structured output against a JSON schema.
2. Streaming.
3. p90 under 5 s for the composition call at about 6,000 input tokens.
4. Prompt caching for the fixed system prompt.

PRD 13 caps LLM spend at $0.05 per generation and $0.20 per draft including refinements. Architecture 6.2 gives the token budget:

| Call | Input | Output |
| --- | --- | --- |
| Brief extraction | about 1,000 | about 300 |
| Composition | about 5,500, of which 1,500 is the fixed system prompt | about 400 |

The build plan names a Claude Haiku 5.5 and Sonnet 5.5 pair as the default to beat.

## Decision

The provider is Anthropic, through the official TypeScript SDK, behind `curator/llm.ts`.

| Call | Model | API ID |
| --- | --- | --- |
| `extractBrief` | Claude Haiku 5.5 | `claude-haiku-5-5` |
| `compose` | Claude Sonnet 5.5 | `claude-sonnet-5-5` |

### Requirements check

| Requirement | Haiku 5.5 | Sonnet 5.5 | Source |
| --- | --- | --- | --- |
| Structured output against a JSON schema | Yes | Yes | Structured outputs page lists both. Requests use `output_config.format` with `type: "json_schema"` |
| Streaming | Yes | Yes | Structured outputs page: they "also work with streaming". The full JSON is accumulated before parsing |
| Prompt caching | Yes, 512-token minimum | Yes, 512-token minimum | Prompt caching page. The 1,500-token system prompt clears the minimum |
| Latency | "Fastest" | "Fast" | Models overview comparison. No provider publishes a p90; see Consequences |

### Prices used

| Model | Input | Cache write (5 min) | Cache hit | Output |
| --- | --- | --- | --- | --- |
| Claude Haiku 5.5 (prompts up to 100,000 tokens) | $0.10 | $0.125 | $0.01 | $0.50 |
| Claude Sonnet 5.5 | $2.00 | $2.50 | $0.10 | $10.00 |

### Cost per generation

Brief extraction on Haiku 5.5, uncached:

| Item | Tokens | Rate | Cost |
| --- | --- | --- | --- |
| Input | 1,000 | $0.10 | $0.000100 |
| Output | 300 | $0.50 | $0.000150 |
| **Brief** | | | **$0.000250** |

Composition on Sonnet 5.5, three cases for the 1,500-token system prompt:

| Item | Tokens | Cache hit | Cache write | No caching |
| --- | --- | --- | --- | --- |
| System prompt | 1,500 | × $0.10 = $0.000150 | × $2.50 = $0.003750 | × $2.00 = $0.003000 |
| Candidates and brief | 4,000 | × $2.00 = $0.008000 | $0.008000 | $0.008000 |
| Output | 400 | × $10.00 = $0.004000 | $0.004000 | $0.004000 |
| **Compose** | | **$0.012150** | **$0.015750** | **$0.015000** |

| Per generation | Cache hit | Cache write | No caching |
| --- | --- | --- | --- |
| Brief + compose | **$0.0124** | **$0.0160** | **$0.0153** |
| Share of the $0.05 cap | 25% | 32% | 31% |

The worst case inside the pipeline's rules is a cache write plus one schema-failure retry of composition (PRD 8.4), which hits the cache: $0.0160 + $0.0122 = **$0.0282**, 56% of the cap.

Per draft, a generation at $0.016 and three refinements at $0.018 each (a refinement's compose call also carries the current list, about 1,000 more input tokens or $0.002) come to about $0.07, under PRD 16.2's $0.10 to $0.20. A draft that uses all 25 model-backed runs costs about $0.40. The 25-run cap bounds the worst case; the $0.20 figure is an average.

Both calls run with thinking off. Thinking tokens bill as output at $10 per million on Sonnet 5.5, so each 1,000 tokens of thinking would add $0.01 and seconds of latency. Sonnet 5.5 rejects `thinking: {type: "disabled"}`, so the compose call sends `{type: "between_tools"}`, which is accepted at effort `high` or below. Haiku 5.5 takes `{type: "disabled"}` at effort `high` or below. These settings come from Anthropic's API reference for these models and are B1's to confirm against the live docs. If the eval (B5) shows low-effort thinking improves composition enough to pay for itself, the cap leaves room for about 3,000 thinking tokens per generation.

### Alternatives at fetched prices

The same token budget, uncached, thinking off:

| Pair (small + main) | Per generation | Notes |
| --- | --- | --- |
| Claude Haiku 5.5 + Claude Sonnet 5.5 | $0.0153 | Chosen |
| Claude Haiku 5.5 for both calls | $0.0010 | Fastest and cheapest; composition quality unproven |
| OpenAI gpt-6-luna + gpt-6.1-terra | $0.0078 | Input $0.10 and $1.00, output $0.50 and $5.00 |
| Google Gemini 3.1 Flash-Lite + Gemini 3.8 Flash | $0.0063 now, $0.0120 from Jan 1, 2027 | Flash prices double on Jan 1, 2027; cache storage billed per hour |

Every pair is under the cap with room to spare. The cheapest alternative main model saves under a cent per generation, which doesn't change PRD 16's margins. Cost doesn't decide this.

What decides it: the default pair is confirmed against requirements 1, 2 and 4 from the provider's own docs, and the alternatives weren't. OpenAI's and Google's pricing pages don't cover structured outputs or caching thresholds, and openai.com's main pricing page refused the fetch. Nothing found beats the default on the requirements, so the default stands.

### Adapter contract

From architecture 6.4, with the choices above filled in:

- `extractBrief(input, schema)` and `compose(input, schema)` take a Zod schema, send it as the JSON schema in `output_config.format`, and return parsed output or a typed error: `schema`, `timeout` or `provider`.
- The fixed system prompt comes first in each request and carries a `cache_control` breakpoint. Per-request content comes after it, so the cache prefix never changes between requests.
- A response with `stop_reason: "refusal"` or `"max_tokens"` is a `provider` or `schema` error, never parsed.
- A schema failure retries once; a second failure ends the run with `generation_failed` (architecture 6.2 step 4).
- Each call records the model ID, input tokens, cache-read and cache-write tokens, output tokens and latency for `curator_run`.
- Model IDs are constants in the adapter file. Provider SDK types don't leave it (PRD 8.5).

## Consequences

- p90 latency is unmeasured. Composition is about 5,500 input tokens (1,500 cached) and about 400 output tokens with thinking off, on a model Anthropic ranks "Fast". Card B1 reports one real call's latency and tokens, and I4 measures p90. If composition misses 5 s at p90, the first fallback is Haiku 5.5 for composition, a one-line change, kept only if the B5 eval holds 45 of 50 acceptable.
- Cache hits need the system prompt to stay byte-identical. A prompt change invalidates the cache for 5 minutes, and costs here assume hits on most calls.
- Haiku 5.5's prices rise above 100,000 prompt tokens. The pipeline sends about 6,000, so this never applies, but a future change that sends the whole catalog would hit it.
- One provider is a single point of failure. Architecture 9.5 covers it: generation fails after the 20 s ceiling, and replace and manual edits keep working without the model. A second provider behind the same adapter is possible later and not built now.
- PRD 8.5 opens with "one capable general model for everything in P0", while its cost line, 8.2 and architecture 6.4 use a small model for the brief. This ADR follows the two-model reading the build plan asks for. Both models are one provider and one model family, so the PRD's intent of no fine-tuning and no proprietary recommender holds.
- These prices are as fetched on 2026-11-08. The `curator_run` token columns let the I4 card recompute cost from real runs.
