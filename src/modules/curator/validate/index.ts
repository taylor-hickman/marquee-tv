// Validate and repair in code (architecture 6.2 step 4, 6.3 pins). The composer's
// list is a suggestion: what comes out holds only candidate ids and kept pins
// (CLAUDE.md rule 1), keeps every pin, removal and exclusion (rule 2), at most
// two per artist, every must-include seed it can, and the target length ±10%.
import type {
  ArtistId,
  Brief,
  CuratorWarning,
  PerformanceId,
  RevisionItem,
} from "@/contracts";
import type { Candidate } from "@/modules/catalog";

export const ARTIST_CAP = 2;
export const DURATION_TOLERANCE = 0.1;

// A pinned item as repair needs it. It may no longer be a candidate (ineligible,
// expired), so its facts come from the list, not retrieval. Duration is null once
// its cache row has expired.
export type PinFacts = {
  artists: { id: ArtistId; name: string }[];
  durationS: number | null;
};

export type RepairInput = {
  // The composer's ids, in its order.
  composed: PerformanceId[];
  candidates: Candidate[];
  // The current list; its pins are what repair keeps.
  items: RevisionItem[];
  pins: Map<PerformanceId, PinFacts>;
  removedIds: PerformanceId[];
  brief: Brief;
  // The person's words this run. A pin is let go only when they name its artist
  // and this run's brief step excluded it.
  instruction: string | null;
  // Artists this run's brief step newly excluded; a held exclusion never lets a pin go.
  newExclusions: ArtistId[];
};

export type RepairResult = {
  items: RevisionItem[];
  removedIds: PerformanceId[];
  // Composer ids outside the candidate set, logged as model errors.
  droppedIds: PerformanceId[];
  // Pins the instruction named and asked to drop: unpinned and removed.
  released: PerformanceId[];
  warnings: CuratorWarning[];
};

type Entry = {
  id: PerformanceId;
  artistIds: ArtistId[];
  durationS: number;
  // Null for a pin that is no longer a candidate.
  energy: number | null;
  item: RevisionItem | null;
  // Pins and seeds added for a gap; the duration fix never drops these.
  kept: boolean;
};

export function repair(input: RepairInput): RepairResult {
  const { brief, candidates } = input;
  const byId = new Map(candidates.map((c) => [c.row.id, c]));
  const excludedArtists = new Set(brief.exclusions.artist_ids);

  const released: PerformanceId[] = [];
  const position: { index: number; entry: Entry }[] = [];
  const free: Entry[] = [];
  const include = new Map<PerformanceId, Entry>();
  for (const [index, item] of input.items.entries()) {
    if (item.pinned === "none") continue;
    const facts = input.pins.get(item.performance_id) ?? {
      artists: [],
      durationS: null,
    };
    // "drop Khruangbin" on a pinned Khruangbin: the newer instruction wins, and
    // only when this run excluded the artist and the text names it (architecture
    // 6.3). An exclusion from an earlier run, or a composer that leaves the pin
    // out, never moves it.
    const named = facts.artists.some(
      (a) =>
        input.newExclusions.includes(a.id) && names(input.instruction, a.name),
    );
    if (named) {
      released.push(item.performance_id);
      continue;
    }
    const entry: Entry = {
      id: item.performance_id,
      artistIds: facts.artists.map((a) => a.id),
      durationS: facts.durationS ?? 0,
      energy: byId.get(item.performance_id)?.row.artist_energy ?? null,
      item,
      kept: true,
    };
    if (item.pinned === "position") position.push({ index, entry });
    else include.set(entry.id, entry);
  }

  const removed = new Set([...input.removedIds, ...released]);
  const used = new Set<PerformanceId>([
    ...position.map((p) => p.entry.id),
    ...include.keys(),
  ]);
  const perArtist = new Map<ArtistId, number>();
  const count = (e: Entry) =>
    e.artistIds.forEach((a) => perArtist.set(a, (perArtist.get(a) ?? 0) + 1));
  position.forEach((p) => count(p.entry));
  include.forEach(count);

  // A candidate repair may place: not removed, excluded, already used or over the cap.
  const open = (c: Candidate) =>
    !used.has(c.row.id) &&
    !removed.has(c.row.id) &&
    !c.artistIds.some((a) => excludedArtists.has(a)) &&
    !brief.exclusions.publisher_ids.includes(c.publisherId) &&
    !brief.series_exclude.includes(c.seriesId) &&
    c.artistIds.every((a) => (perArtist.get(a) ?? 0) < ARTIST_CAP);
  const take = (c: Candidate, kept = false): Entry => {
    const entry: Entry = {
      id: c.row.id,
      artistIds: c.artistIds,
      durationS: c.row.duration_s,
      energy: c.row.artist_energy,
      item: null,
      kept,
    };
    used.add(entry.id);
    count(entry);
    return entry;
  };

  const dropped: PerformanceId[] = [];
  for (const id of input.composed) {
    const pick = include.get(id);
    if (pick) {
      // An include pin goes where the composer put it (architecture 6.3).
      if (!free.includes(pick)) free.push(pick);
      continue;
    }
    // A pin is the person's, not a model error, wherever the composer put it.
    if (used.has(id) || released.includes(id)) continue;
    const candidate = byId.get(id);
    if (!candidate) {
      if (!dropped.includes(id)) dropped.push(id);
      continue;
    }
    if (open(candidate)) free.push(take(candidate));
  }
  for (const pick of include.values())
    if (!free.includes(pick)) free.push(pick);

  position.sort((a, b) => a.index - b.index);
  const layout = () => merge(position, free);
  const startMin = (list: Entry[], at: number) =>
    list.slice(0, at).reduce((sum, e) => sum + e.durationS, 0) / 60;

  const warnings: CuratorWarning[] = [];
  for (const seed of brief.seeds) {
    if (!seed.must_include) continue;
    const present = layout().find((e) => e.artistIds.includes(seed.artist_id));
    if (present) {
      // The composer placed it: the length fix may not drop it.
      present.kept = true;
      continue;
    }
    const pick = candidates.find(
      (c) => c.artistIds.includes(seed.artist_id) && open(c),
    );
    if (!pick) {
      warnings.push({ code: "seed_unavailable", artist_id: seed.artist_id });
      continue;
    }
    const entry = take(pick, true);
    // The slot whose curve energy is closest to the seed's.
    let best = { at: free.length, miss: Infinity };
    for (let at = 0; at <= free.length; at++) {
      free.splice(at, 0, entry);
      const list = layout();
      const miss = Math.abs(
        entry.energy! - curveAt(brief, startMin(list, list.indexOf(entry))),
      );
      free.splice(at, 1);
      if (miss < best.miss) best = { at, miss };
    }
    free.splice(best.at, 0, entry);
  }

  // The fewest free items that put every position pin at its index.
  const minFree = Math.max(0, ...position.map((p, rank) => p.index - rank));
  const closest = (minute: number, fits: (c: Candidate) => boolean) =>
    candidates
      .filter((c) => open(c) && fits(c))
      .reduce<Candidate | undefined>(
        (best, c) =>
          !best ||
          miss(c.row.artist_energy, minute) <
            miss(best.row.artist_energy, minute)
            ? c
            : best,
        undefined,
      );
  const miss = (energy: number, minute: number) =>
    Math.abs(energy - curveAt(brief, minute));
  const total = () =>
    free
      .concat(position.map((p) => p.entry))
      .reduce((s, e) => s + e.durationS, 0);

  while (free.length < minFree) {
    const pick = closest(startMin(free, free.length), () => true);
    if (!pick) break;
    free.push(take(pick));
  }

  // Models are poor at sums, so code fixes the length: add the best energy match
  // at the end of the set, or drop the worst fit, until it is in range.
  const target = brief.duration_s;
  const low = target * (1 - DURATION_TOLERANCE);
  const high = target * (1 + DURATION_TOLERANCE);
  while (total() < low) {
    const room = high - total();
    const pick = closest(total() / 60, (c) => c.row.duration_s <= room);
    if (!pick) break;
    free.push(take(pick));
  }
  while (total() > high && free.length > minFree) {
    const list = layout();
    const over = total() - low;
    const worst = free
      .filter((e) => !e.kept && e.durationS <= over)
      .map((e) => ({
        e,
        miss: miss(e.energy!, startMin(list, list.indexOf(e))),
      }))
      .reduce<{ e: Entry; miss: number } | undefined>(
        (worst, x) => (!worst || x.miss >= worst.miss ? x : worst),
        undefined,
      );
    if (!worst) break;
    free.splice(free.indexOf(worst.e), 1);
    worst.e.artistIds.forEach((a) => perArtist.set(a, perArtist.get(a)! - 1));
    used.delete(worst.e.id);
  }
  const actual = total();
  if (actual < low || actual > high) {
    warnings.push({
      code: "duration_out_of_range",
      target_s: target,
      actual_s: actual,
    });
  }

  const seeds = new Set(brief.seeds.map((s) => s.artist_id));
  return {
    items: layout().map(
      (e) =>
        e.item ?? {
          performance_id: e.id,
          pinned: "none",
          source: e.artistIds.some((a) => seeds.has(a)) ? "seed" : "ai",
        },
    ),
    removedIds: [...new Set([...input.removedIds, ...released])],
    droppedIds: dropped,
    released,
    warnings,
  };
}

// Position pins at their indexes, free items filling the slots between them in
// order. Pins past the end of the list follow it, in order.
function merge(
  position: { index: number; entry: Entry }[],
  free: Entry[],
): Entry[] {
  const list: Entry[] = [];
  let f = 0;
  let p = 0;
  while (f < free.length || p < position.length) {
    if (
      p < position.length &&
      (position[p].index === list.length || f === free.length)
    ) {
      list.push(position[p++].entry);
    } else {
      list.push(free[f++]);
    }
  }
  return list;
}

// The curve's energy at `minute`; past the end, the last segment's.
function curveAt(brief: Brief, minute: number): number {
  const segment =
    brief.curve.find((s) => s.from_min <= minute && minute < s.to_min) ??
    brief.curve.at(-1)!;
  return segment.energy;
}

// Whether the text names the artist as a whole word or phrase, ignoring case.
export function names(text: string | null, artist: string): boolean {
  if (!text || !artist.trim()) return false;
  const escaped = artist.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}
