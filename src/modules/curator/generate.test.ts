// Each test scripts the fake adapter to break one rule and checks what repair
// hands back (build plan B3). Catalog reads are stubs: the rules live in code.
import { describe, expect, test, vi } from "vitest";
import type {
  BriefInput,
  CuratorProposal,
  PerformanceCard,
  RevisionItem,
  StreamEvent,
} from "@/contracts";
import type { Candidate } from "@/modules/catalog";
import type { BriefContext } from "./brief";
import type { ModelBrief } from "./brief/prompt";
import { createGenerate, echo } from "./generate";
import { createFakeAdapter } from "./llm";
import type { FakeReply } from "./llm/fake";
import type { CuratorState } from "./types";

const KHRUANGBIN = 50;

// Ten-minute performances, one artist each unless given.
function candidate(
  id: number,
  artist = id,
  { energy = 3, durationS = 600 } = {},
): Candidate {
  return {
    row: {
      id,
      artist: `Artist ${artist}`,
      series: "Live on KEXP",
      duration_s: durationS,
      artist_energy: energy,
      genres: ["soul"],
    },
    artistIds: [artist],
    seriesId: 1,
    publisherId: 1,
  };
}

function card(
  id: number,
  artist: { id: number; name: string },
): PerformanceCard {
  return {
    id,
    videoId: "abcdefghijk",
    title: "never shown to the model",
    artists: [artist],
    publisher: { id: 1, name: "KEXP" },
    series: { id: 1, name: "Live on KEXP" },
    durationS: 600,
    publishedAt: null,
  };
}

const context: BriefContext = {
  publishers: [{ id: 1, name: "KEXP" }],
  series: [
    {
      id: 1,
      publisher_id: 1,
      name: "Live on KEXP",
      convention: "full band in studio",
    },
  ],
  artistIdFor: async (name) =>
    name.toLowerCase() === "khruangbin" ? KHRUANGBIN : null,
};

function modelBrief(overrides: Partial<ModelBrief> = {}): ModelBrief {
  return {
    stated_length_min: null,
    curve: [{ from_min: 0, to_min: 60, energy: 3 }],
    genres: ["soul"],
    scenes: [],
    sources_include: [],
    sources_exclude: [],
    format_include: [],
    format_exclude: [],
    exclude_artists: [],
    influences: [],
    novelty: "default",
    surprise: false,
    ...overrides,
  };
}

type Setup = {
  input?: Partial<BriefInput>;
  brief?: Partial<ModelBrief>;
  candidates?: Candidate[];
  items?: RevisionItem[];
  removedIds?: number[];
  cards?: PerformanceCard[];
  composed: number[] | (() => FakeReply);
};

const sixty = Array.from({ length: 12 }, (_, i) => candidate(i + 1));

async function run(setup: Setup) {
  const compose = vi.fn(
    typeof setup.composed === "function"
      ? setup.composed
      : () => ({
          output: {
            ids: setup.composed,
            title: "Warm room",
            arc: "Easy all the way",
          },
        }),
  );
  const llm = createFakeAdapter({
    extractBrief: () => ({ output: modelBrief(setup.brief) }),
    compose,
  });
  const generate = createGenerate({
    llm,
    briefContext: async () => context,
    retrieveCandidates: async () => setup.candidates ?? sixty,
    performanceCards: async (ids) =>
      (setup.cards ?? []).filter((c) => ids.includes(c.id)),
  });
  const state: CuratorState = {
    draftId: "00000000-0000-4000-8000-000000000001",
    input: {
      text: "warm soul for a dinner",
      durationS: 3600,
      seeds: [],
      ...setup.input,
    },
    brief: null,
    items: setup.items ?? [],
    removedIds: setup.removedIds ?? [],
    earlierIds: [],
  };
  const events: StreamEvent[] = [];
  const outcome = await generate(state, {
    emit: (e) => events.push(e),
    signal: new AbortController().signal,
  });
  return { outcome, events, compose };
}

function proposal(
  outcome: Awaited<ReturnType<typeof run>>["outcome"],
): CuratorProposal {
  if (!outcome.ok) throw new Error(`run failed: ${outcome.error}`);
  return outcome.proposal;
}

const ids = (p: CuratorProposal) => p.items.map((i) => i.performance_id);
const ai = (id: number): RevisionItem => ({
  performance_id: id,
  pinned: "none",
  source: "ai",
});

describe("generate", () => {
  test("runs brief, retrieval and compose, and emits the brief and the candidate count", async () => {
    const { outcome, events } = await run({ composed: [1, 2, 3, 4, 5, 6] });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.trigger).toBe("generate");
    expect(p.title).toBe("Warm room");
    expect(p.description).toBe("Easy all the way");
    expect(p.warnings).toEqual([]);
    expect(p.run.candidateIds).toHaveLength(12);
    expect(p.run.model).toBe("fake");
    expect(events).toEqual([
      expect.objectContaining({
        type: "brief",
        echo: "1 hour · easy throughout",
      }),
      { type: "candidates", count: 12 },
    ]);
  });

  test("rule 1: an invented id is dropped and logged as a model error", async () => {
    const { outcome } = await run({ composed: [1, 2, 999, 3, 4, 5, 6] });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.run.outputIds).toContain(999);
    expect(p.run.droppedIds).toEqual([999]);
    expect(p.warnings).toEqual([]);
  });

  test("rule 2: a pin the composer moved goes back to its index", async () => {
    const items = [
      ai(1),
      { performance_id: 7, pinned: "position", source: "manual" } as const,
      ai(2),
    ];
    const { outcome } = await run({
      items,
      cards: [card(7, { id: 7, name: "Artist 7" })],
      composed: [7, 1, 2, 3, 4, 5],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 7, 2, 3, 4, 5]);
    expect(p.items[1]).toEqual(items[1]);
    expect(p.run.droppedIds).toEqual([]);
    expect(p.warnings).toEqual([]);
  });

  test("rule 2: a removed id the composer returned stays out, and the length is refilled", async () => {
    const { outcome } = await run({
      removedIds: [3],
      composed: [1, 2, 3, 4, 5, 6],
    });
    const p = proposal(outcome);
    expect(ids(p)).not.toContain(3);
    expect(ids(p)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(p.removedIds).toEqual([3]);
    expect(p.warnings).toEqual([]);
  });

  test("three of one artist: the third is dropped and the length refilled", async () => {
    const candidates = [
      candidate(1, 1),
      candidate(2, 1),
      candidate(3, 1),
      ...sixty.slice(3),
    ];
    const { outcome } = await run({ candidates, composed: [1, 2, 3, 4, 5, 6] });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(p.warnings).toEqual([]);
  });

  test("a duplicate id appears once", async () => {
    const { outcome } = await run({ composed: [1, 2, 2, 3, 4, 5, 6] });
    expect(ids(proposal(outcome))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("a set 30% short is filled to the target with the best energy match", async () => {
    // Target 100 min; the composer's seven ten-minute items make 70.
    const candidates = [
      ...Array.from({ length: 7 }, (_, i) => candidate(i + 1)),
      candidate(8, 8, { energy: 5 }),
      candidate(9, 9, { energy: 4 }),
      candidate(10, 10, { energy: 4 }),
      candidate(11, 11, { energy: 4 }),
    ];
    const { outcome } = await run({
      input: { durationS: 6000 },
      brief: { curve: [{ from_min: 0, to_min: 100, energy: 4 }] },
      candidates,
      composed: [1, 2, 3, 4, 5, 6, 7],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10]);
    expect(p.warnings).toEqual([]);
  });

  test("a set 30% long drops the worst energy fits until it is in range", async () => {
    const candidates = Array.from({ length: 13 }, (_, i) =>
      candidate(i + 1, i + 1, { energy: i === 4 || i === 8 ? 1 : 3 }),
    );
    const { outcome } = await run({
      input: { durationS: 6000 },
      brief: { curve: [{ from_min: 0, to_min: 100, energy: 3 }] },
      candidates,
      composed: candidates.map((c) => c.row.id),
    });
    const p = proposal(outcome);
    expect(ids(p)).not.toContain(5);
    expect(ids(p)).not.toContain(9);
    expect(ids(p)).toHaveLength(11);
    expect(p.warnings).toEqual([]);
  });

  test("a length repair cannot reach is a warning", async () => {
    const { outcome } = await run({
      candidates: sixty.slice(0, 3),
      composed: [1, 2, 3],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3]);
    expect(p.warnings).toEqual([
      { code: "duration_out_of_range", target_s: 3600, actual_s: 1800 },
    ]);
  });

  test("a missing must-include seed is added where the curve fits it", async () => {
    const candidates = [...sixty.slice(0, 6), candidate(20, 9, { energy: 5 })];
    const { outcome } = await run({
      input: { seeds: [{ artistId: 9, name: "Artist 9", mustInclude: true }] },
      brief: {
        curve: [
          { from_min: 0, to_min: 30, energy: 3 },
          { from_min: 30, to_min: 60, energy: 5 },
        ],
      },
      candidates,
      composed: [1, 2, 3, 4, 5, 6],
    });
    const p = proposal(outcome);
    // Seventy minutes: the worst fit for the loud second half goes.
    expect(ids(p)).toEqual([1, 2, 3, 20, 4, 5]);
    expect(p.items[3]).toEqual({
      performance_id: 20,
      pinned: "none",
      source: "seed",
    });
    expect(p.warnings).toEqual([]);
  });

  test("a must-include seed with no eligible performance is a gap warning", async () => {
    const { outcome } = await run({
      input: { seeds: [{ artistId: 9, name: "Artist 9", mustInclude: true }] },
      candidates: sixty.filter((c) => c.row.id !== 9),
      composed: [1, 2, 3, 4, 5, 6],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.warnings).toEqual([{ code: "seed_unavailable", artist_id: 9 }]);
  });

  const pinnedKhruangbin = {
    items: [
      { performance_id: 40, pinned: "position", source: "manual" } as const,
      ai(1),
    ],
    cards: [card(40, { id: KHRUANGBIN, name: "Khruangbin" })],
  };

  test("rule 2: a pin the composer dropped without the artist named comes back", async () => {
    const { outcome } = await run({
      ...pinnedKhruangbin,
      // The brief step misread an exclusion the text never made.
      brief: { exclude_artists: ["Khruangbin"] },
      input: { text: "something mellow" },
      composed: [1, 2, 3, 4, 5],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([40, 1, 2, 3, 4, 5]);
    expect(p.items[0]).toEqual(pinnedKhruangbin.items[0]);
    expect(p.removedIds).toEqual([]);
    expect(p.warnings).toEqual([]);
  });

  test("rule 2: a pin is unpinned and removed when the instruction names its artist", async () => {
    const { outcome } = await run({
      ...pinnedKhruangbin,
      brief: { exclude_artists: ["Khruangbin"] },
      input: { text: "drop Khruangbin" },
      composed: [1, 2, 3, 4, 5],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.removedIds).toEqual([40]);
    expect(p.brief.exclusions.artist_ids).toEqual([KHRUANGBIN]);
    expect(p.warnings).toEqual([]);
  });

  test("a schema failure is retried once", async () => {
    let calls = 0;
    const { outcome, compose } = await run({
      composed: () =>
        ++calls === 1
          ? { output: { ids: "not a list" } }
          : {
              output: {
                ids: [1, 2, 3, 4, 5, 6],
                title: "Warm room",
                arc: "Easy",
              },
            },
    });
    expect(compose).toHaveBeenCalledTimes(2);
    expect(ids(proposal(outcome))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("a second schema failure ends the run with no proposal", async () => {
    const { outcome, compose } = await run({
      composed: () => ({ output: { ids: [] } }),
    });
    expect(compose).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({
      ok: false,
      error: "schema",
      run: expect.objectContaining({
        candidateIds: sixty.map((c) => c.row.id),
        outputIds: [],
      }),
    });
  });

  test("a failed brief step ends the run before retrieval", async () => {
    const llm = createFakeAdapter({
      extractBrief: () => ({ error: "timeout" }),
    });
    const retrieveCandidates = vi.fn();
    const generate = createGenerate({
      llm,
      briefContext: async () => context,
      retrieveCandidates,
      performanceCards: async () => [],
    });
    const outcome = await generate(
      {
        draftId: "00000000-0000-4000-8000-000000000001",
        input: { text: "soul", durationS: 3600, seeds: [] },
        brief: null,
        items: [],
        removedIds: [],
        earlierIds: [],
      },
      { emit: () => {}, signal: new AbortController().signal },
    );
    expect(outcome).toMatchObject({ ok: false, error: "timeout" });
    expect(retrieveCandidates).not.toHaveBeenCalled();
  });
});

describe("echo", () => {
  test.each([
    [7200, [2, 4], "2 hours · starts mellow, ends upbeat"],
    [2700, [5], "45 min · loud throughout"],
  ])("%i s", (durationS, energies, expected) => {
    const curve = energies.map((energy, i) => ({
      from_min: i * 10,
      to_min: i * 10 + 10,
      energy,
    }));
    expect(echo({ ...proposalBrief, curve, duration_s: durationS })).toBe(
      expected,
    );
  });
});

const proposalBrief = {
  curve: [{ from_min: 0, to_min: 60, energy: 3 }],
  genres: [],
  scenes: [],
  seeds: [],
  influences: [],
  series_include: [],
  series_exclude: [],
  novelty: "default" as const,
  surprise: false,
  exclusions: { artist_ids: [], publisher_ids: [] },
  duration_s: 3600,
};
