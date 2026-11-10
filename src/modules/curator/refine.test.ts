// Refine scripts the fake adapter's brief step and its ops, and checks what code
// does with them (build plan B4). Catalog reads are stubs: the rules live in code.
import { describe, expect, test, vi } from "vitest";
import type {
  Brief,
  CuratorOp,
  CuratorProposal,
  PerformanceCard,
  RevisionItem,
  StreamEvent,
} from "@/contracts";
import type { Candidate } from "@/modules/catalog";
import type { BriefContext } from "./brief";
import type { ModelRefine } from "./brief/prompt";
import { type LlmInput, createFakeAdapter } from "./llm";
import type { FakeReply } from "./llm/fake";
import { createRefine } from "./refine";
import type { CuratorState } from "./types";

const KHRUANGBIN = 50;
const TINY_DESK = { id: 2, name: "Tiny Desk" };

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

function card(
  id: number,
  {
    name = `Artist ${id}`,
    artist = id,
    series = { id: 1, name: "Live on KEXP" },
  } = {},
): PerformanceCard {
  return {
    id,
    videoId: "abcdefghijk",
    title: "never shown to the model",
    artists: [{ id: artist, name }],
    publisher: { id: 1, name: "KEXP" },
    series,
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
    { id: 2, publisher_id: 1, name: "Tiny Desk", convention: "stripped back" },
  ],
  artistIdFor: async (name) =>
    name.toLowerCase() === "khruangbin" ? KHRUANGBIN : null,
};

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

function modelRefine(overrides: Partial<ModelRefine> = {}): ModelRefine {
  return {
    scope: null,
    stated_length_min: null,
    curve: null,
    genres: null,
    scenes: null,
    sources_include: [],
    sources_exclude: [],
    format_include: [],
    format_exclude: [],
    exclude_artists: [],
    novelty: null,
    ...overrides,
  };
}

const ai = (id: number): RevisionItem => ({
  performance_id: id,
  pinned: "none",
  source: "ai",
});
const pinned = (id: number): RevisionItem => ({
  performance_id: id,
  pinned: "position",
  source: "manual",
});

const twelve = Array.from({ length: 12 }, (_, i) => candidate(i + 1));

type Setup = {
  instruction?: string;
  brief?: Partial<ModelRefine>;
  items: RevisionItem[];
  cards?: PerformanceCard[];
  ops: CuratorOp[] | (() => FakeReply);
};

async function run(setup: Setup) {
  const compose = vi.fn<(input: LlmInput) => FakeReply>(
    typeof setup.ops === "function"
      ? setup.ops
      : () => ({
          output: { ops: setup.ops, title: "Warmer room", arc: "Lifts late" },
        }),
  );
  const cards = setup.cards ?? setup.items.map((i) => card(i.performance_id));
  const refine = createRefine({
    llm: createFakeAdapter({
      extractBrief: () => ({ output: modelRefine(setup.brief) }),
      compose,
    }),
    briefContext: async () => context,
    retrieveCandidates: async () => twelve,
    performanceCards: async (ids) => cards.filter((c) => ids.includes(c.id)),
  });
  const state: CuratorState = {
    draftId: "00000000-0000-4000-8000-000000000001",
    input: null,
    brief: held,
    items: setup.items,
    removedIds: [],
    earlierIds: [],
  };
  const events: StreamEvent[] = [];
  const outcome = await refine(state, setup.instruction ?? "calmer", {
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

describe("refine", () => {
  test("applies the composer's ops to the current list and sets trigger refine", async () => {
    const { outcome, events } = await run({
      items: [1, 2, 3, 4, 5, 6].map(ai),
      ops: [
        { op: "replace", performance_id: 5, with_performance_id: 7 },
        { op: "move", performance_id: 1, to_index: 2 },
      ],
    });
    const p = proposal(outcome);
    expect(p.trigger).toBe("refine");
    expect(ids(p)).toEqual([2, 3, 1, 4, 7, 6]);
    expect(p.title).toBe("Warmer room");
    expect(p.description).toBe("Lifts late");
    expect(p.run.outputIds).toEqual([7]);
    expect(p.warnings).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(["brief", "candidates"]);
  });

  test("rule 2: a refine that moves a pinned item is rejected and the pin keeps its index", async () => {
    const items = [ai(1), ai(2), pinned(3), ai(4), ai(5), ai(6)];
    const { outcome } = await run({
      items,
      ops: [
        { op: "move", performance_id: 3, to_index: 0 },
        { op: "replace", performance_id: 5, with_performance_id: 7 },
      ],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3, 4, 7, 6]);
    expect(p.items[2]).toEqual(items[2]);
  });

  test("rule 2: a pin stays when the composer removes or replaces it and the instruction doesn't name its artist", async () => {
    const items = [ai(1), ai(2), pinned(3), ai(4), ai(5), ai(6)];
    const { outcome } = await run({
      items,
      ops: [
        { op: "remove", performance_id: 3 },
        { op: "replace", performance_id: 3, with_performance_id: 8 },
      ],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.removedIds).toEqual([]);
  });

  test("rule 2: drop <artist> unpins and removes a pinned item when the instruction names it", async () => {
    const items = [ai(1), ai(2), pinned(KHRUANGBIN), ai(4), ai(5), ai(6)];
    const { outcome } = await run({
      instruction: "drop Khruangbin",
      brief: { exclude_artists: ["Khruangbin"] },
      items,
      cards: [
        ...[1, 2, 4, 5, 6].map((id) => card(id)),
        card(KHRUANGBIN, { name: "Khruangbin" }),
      ],
      ops: [{ op: "remove", performance_id: KHRUANGBIN }],
    });
    const p = proposal(outcome);
    expect(ids(p)).not.toContain(KHRUANGBIN);
    expect(ids(p)).toEqual([1, 2, 4, 5, 6, 3]);
    expect(p.removedIds).toEqual([KHRUANGBIN]);
    expect(p.brief.exclusions.artist_ids).toEqual([KHRUANGBIN]);
  });

  test("rule 2: an exclusion of a pinned artist the instruction never names is a misread, and the pin stays", async () => {
    const items = [ai(1), ai(2), pinned(KHRUANGBIN), ai(4), ai(5), ai(6)];
    const { outcome } = await run({
      instruction: "less of the desert stuff",
      brief: { exclude_artists: ["Khruangbin"] },
      items,
      cards: [
        ...[1, 2, 4, 5, 6].map((id) => card(id)),
        card(KHRUANGBIN, { name: "Khruangbin" }),
      ],
      ops: [{ op: "remove", performance_id: KHRUANGBIN }],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([1, 2, KHRUANGBIN, 4, 5, 6]);
    expect(p.brief.exclusions.artist_ids).toEqual([]);
    expect(p.removedIds).toEqual([]);
  });

  test("rule 1: an added id outside the candidate set is dropped and logged", async () => {
    const { outcome } = await run({
      items: [1, 2, 3, 4, 5, 6].map(ai),
      ops: [
        { op: "add", performance_id: 999, index: 0 },
        { op: "replace", performance_id: 2, with_performance_id: 998 },
      ],
    });
    const p = proposal(outcome);
    expect(ids(p)).not.toContain(999);
    expect(ids(p)).not.toContain(998);
    expect(p.run.droppedIds).toEqual([999, 998]);
    expect(p.run.outputIds).toEqual([999, 998]);
  });

  test("rule 2: a source the instruction rules out leaves the list even where the composer kept it", async () => {
    const { outcome } = await run({
      instruction: "no Tiny Desk",
      brief: { sources_exclude: ["Tiny Desk"] },
      items: [1, 2, 3, 24, 5, 6].map(ai),
      cards: [1, 2, 3, 5, 6]
        .map((id) => card(id))
        .concat(card(24, { series: TINY_DESK })),
      ops: [],
    });
    const p = proposal(outcome);
    expect(p.brief.series_exclude).toEqual([TINY_DESK.id]);
    expect(ids(p)).toEqual([1, 2, 3, 5, 6, 4]);
  });

  test("items retrieval didn't return stay in the list and are not model errors", async () => {
    const items = [21, 22, 23, 24, 25, 26].map(ai);
    const { outcome } = await run({
      items: [{ ...items[0], source: "manual" }, ...items.slice(1)],
      ops: [{ op: "replace", performance_id: 22, with_performance_id: 1 }],
    });
    const p = proposal(outcome);
    expect(ids(p)).toEqual([21, 1, 23, 24, 25, 26]);
    expect(p.items[0].source).toBe("manual");
    expect(p.run.droppedIds).toEqual([]);
  });

  test("the brief delta merges into the current brief", async () => {
    const { outcome, compose } = await run({
      instruction: "funkier in the second half",
      brief: {
        scope: { from_index: 3, to_index: 5 },
        curve: [{ from_min: 30, to_min: 60, energy: 4 }],
        genres: ["funk"],
      },
      items: [1, 2, 3, 4, 5, 6].map(ai),
      ops: [],
    });
    const p = proposal(outcome);
    expect(p.brief.curve).toEqual([
      { from_min: 0, to_min: 30, energy: 3 },
      { from_min: 30, to_min: 60, energy: 4 },
    ]);
    expect(p.brief.genres).toEqual(["funk"]);
    const user = compose.mock.calls[0][0].user;
    expect(user).toContain("Scope: rows 3 to 5");
    expect(user).toContain("Instruction: funkier in the second half");
  });

  test("rule 5: performance titles never reach the composer", async () => {
    const { compose } = await run({
      items: [1, 2, 3, 4, 5, 6].map(ai),
      ops: [],
    });
    expect(compose.mock.calls[0][0].user).not.toContain(
      "never shown to the model",
    );
  });

  test("a failed compose ends the run with no proposal", async () => {
    const { outcome } = await run({
      items: [1, 2, 3, 4, 5, 6].map(ai),
      ops: () => ({ error: "provider" }),
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: "provider",
      run: { candidateIds: twelve.map((c) => c.row.id) },
    });
  });
});
