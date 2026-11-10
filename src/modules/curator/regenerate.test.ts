// Regenerate and fill run generate's pipeline with the pins read differently
// (build plan B4): regenerate holds every pin where it is, fill lets the composer
// place the person's picks. Catalog reads are stubs.
import { describe, expect, test, vi } from "vitest";
import type {
  Brief,
  CuratorProposal,
  PerformanceCard,
  RevisionItem,
} from "@/contracts";
import type { Candidate } from "@/modules/catalog";
import type { ModelBrief } from "./brief/prompt";
import { createFill } from "./fill";
import type { GenerateDeps } from "./generate";
import { type LlmInput, createFakeAdapter } from "./llm";
import type { FakeReply } from "./llm/fake";
import { createRegenerate } from "./regenerate";
import type { CuratorOutcome, CuratorState } from "./types";

// Ten-minute performances, one artist each.
function candidate(id: number): Candidate {
  return {
    row: {
      id,
      artist: `Artist ${id}`,
      series: "Live on KEXP",
      duration_s: 600,
      artist_energy: 3,
      genres: ["soul"],
    },
    artistIds: [id],
    seriesId: 1,
    publisherId: 1,
  };
}

function card(id: number): PerformanceCard {
  return {
    id,
    videoId: "abcdefghijk",
    title: "never shown to the model",
    artists: [{ id, name: `Artist ${id}` }],
    publisher: { id: 1, name: "KEXP" },
    series: { id: 1, name: "Live on KEXP" },
    durationS: 600,
    publishedAt: null,
  };
}

const held: Brief = {
  curve: [{ from_min: 0, to_min: 60, energy: 3 }],
  genres: ["soul"],
  scenes: [],
  seeds: [],
  influences: [],
  series_include: [],
  series_exclude: [],
  novelty: "default",
  surprise: false,
  exclusions: { artist_ids: [], publisher_ids: [] },
  duration_s: 3600,
};

const modelBrief: ModelBrief = {
  stated_length_min: null,
  curve: [{ from_min: 0, to_min: 60, energy: 3 }],
  genres: ["funk"],
  scenes: [],
  sources_include: [],
  sources_exclude: [],
  format_include: [],
  format_exclude: [],
  exclude_artists: [],
  influences: [],
  novelty: "default",
  surprise: false,
};

const ai = (id: number): RevisionItem => ({
  performance_id: id,
  pinned: "none",
  source: "ai",
});
const pick = (id: number): RevisionItem => ({
  performance_id: id,
  pinned: "include",
  source: "manual",
});
const pinned = (id: number): RevisionItem => ({
  performance_id: id,
  pinned: "position",
  source: "manual",
});

const twelve = Array.from({ length: 12 }, (_, i) => candidate(i + 1));

function deps(composed: number[]) {
  const extractBrief = vi.fn(() => ({ output: modelBrief }));
  const compose = vi.fn<(input: LlmInput) => FakeReply>(() => ({
    output: { ids: composed, title: "Warm room", arc: "Easy all the way" },
  }));
  const generateDeps: GenerateDeps = {
    llm: createFakeAdapter({ extractBrief, compose }),
    briefContext: async () => ({
      publishers: [],
      series: [],
      artistIdFor: async () => null,
    }),
    retrieveCandidates: async () => twelve,
    performanceCards: async (ids) => ids.map(card),
  };
  return { generateDeps, extractBrief, compose };
}

function state(items: RevisionItem[], overrides: Partial<CuratorState> = {}) {
  return {
    draftId: "00000000-0000-4000-8000-000000000001",
    input: null,
    brief: held,
    items,
    removedIds: [],
    earlierIds: [],
    ...overrides,
  } satisfies CuratorState;
}

const options = { emit: () => {}, signal: new AbortController().signal };

function proposal(outcome: CuratorOutcome): CuratorProposal {
  if (!outcome.ok) throw new Error(`run failed: ${outcome.error}`);
  return outcome.proposal;
}

const ids = (p: CuratorProposal) => p.items.map((i) => i.performance_id);

describe("regenerate", () => {
  test("rule 2: a regenerate keeps every pin in place, include pins too, and skips the brief step", async () => {
    const items = [ai(1), pick(7), ai(2), pinned(8), ai(3), ai(4)];
    const { generateDeps, extractBrief } = deps([9, 10, 11, 12, 7, 8]);
    const p = proposal(
      await createRegenerate(generateDeps)(state(items), options),
    );
    expect(p.trigger).toBe("regenerate");
    expect(ids(p)).toEqual([9, 7, 10, 8, 11, 12]);
    expect(p.items[1]).toEqual(items[1]);
    expect(p.items[3]).toEqual(items[3]);
    expect(p.brief).toEqual(held);
    expect(extractBrief).not.toHaveBeenCalled();
  });

  test("a changed brief runs the brief step", async () => {
    const { generateDeps, extractBrief } = deps([1, 2, 3, 4, 5, 6]);
    const p = proposal(
      await createRegenerate(generateDeps)(
        state([ai(1)], {
          input: { text: "funkier", durationS: 3600, seeds: [] },
        }),
        options,
      ),
    );
    expect(extractBrief).toHaveBeenCalledOnce();
    expect(p.brief.genres).toEqual(["funk"]);
    expect(p.trigger).toBe("regenerate");
  });

  test("a failed run passes through with no proposal", async () => {
    const { generateDeps } = deps([]);
    const outcome = await createRegenerate(generateDeps)(
      state([ai(1)]),
      options,
    );
    expect(outcome).toMatchObject({ ok: false, error: "schema" });
  });
});

describe("fill", () => {
  test("rule 2: a fill places inclusion pins where the composer puts them and keeps them", async () => {
    const items = [pick(7), pick(8)];
    const { generateDeps, compose } = deps([1, 2, 8, 3, 7, 4]);
    const p = proposal(await createFill(generateDeps)(state(items), options));
    expect(p.trigger).toBe("generate");
    expect(ids(p)).toEqual([1, 2, 8, 3, 7, 4]);
    expect(p.items[2]).toEqual(items[1]);
    expect(p.items[4]).toEqual(items[0]);
    expect(compose.mock.calls[0][0].user).toContain("7|0|include|");
  });

  test("rule 2: a pick the composer leaves out is still in the set", async () => {
    const { generateDeps } = deps([1, 2, 3, 4, 5]);
    const p = proposal(
      await createFill(generateDeps)(state([pick(7)]), options),
    );
    expect(ids(p)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(p.items[5]).toEqual(pick(7));
  });

  test("an unpinned manual pick becomes an inclusion pin", async () => {
    const manual: RevisionItem = { ...ai(7), source: "manual" };
    const { generateDeps } = deps([1, 2, 3, 4, 5, 6]);
    const p = proposal(
      await createFill(generateDeps)(state([manual, ai(9)]), options),
    );
    expect(ids(p)).toContain(7);
    expect(p.items.find((i) => i.performance_id === 7)).toEqual(pick(7));
  });

  test("rule 2: a pick the person moved by hand keeps its index", async () => {
    const items = [ai(1), pinned(8), pick(7)];
    const { generateDeps } = deps([7, 8, 2, 3, 4, 5]);
    const p = proposal(await createFill(generateDeps)(state(items), options));
    expect(ids(p)).toEqual([7, 8, 2, 3, 4, 5]);
    expect(p.items[1]).toEqual(items[1]);
  });
});
