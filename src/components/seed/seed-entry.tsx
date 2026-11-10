"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { savePendingBrief } from "@/components/landing/pending-brief";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createApiClient } from "@/lib/client/api";
import type { BriefInput } from "@/contracts";
import {
  addSeed,
  canMustInclude,
  options as listOptions,
  seedKey,
  toBriefSeeds,
  type Option,
  type Seed,
  type TypeaheadArtist,
} from "./seeds";

const api = createApiClient();
const TYPEAHEAD_DELAY_MS = 150;
// PRD 7.1's default; the landing's duration control is card E2's.
const DURATION_S = 2 * 3600;

const performances = (n: number) => `${n} performance${n === 1 ? "" : "s"}`;

export function SeedEntry() {
  const router = useRouter();
  const toast = useToast();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; artists: TypeaheadArtist[] }>(
    { q: "", artists: [] },
  );
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const q = query.trim();
  useEffect(() => {
    if (!q) return;
    let current = true;
    const timer = setTimeout(async () => {
      const result = await api.searchArtists(q);
      if (current && result.ok) setFound({ q, artists: result.value.artists });
    }, TYPEAHEAD_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q]);

  // Nothing is offered until the typeahead answers this query, so a catalog
  // name is never offered as a reference while it loads.
  const choices =
    q && found.q === q ? listOptions(q, found.artists, seeds) : [];
  const expanded = open && choices.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  function choose(option: Option) {
    setSeeds((s) => addSeed(s, option));
    setQuery("");
    setActive(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + choices.length) % choices.length || 0);
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      choose(choices[Math.min(active, choices.length - 1)]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const toggle = (key: string) =>
    setSeeds((s) =>
      s.map((seed) =>
        seedKey(seed) === key && seed.kind === "catalog"
          ? { ...seed, mustInclude: !seed.mustInclude }
          : seed,
      ),
    );
  const remove = (key: string) =>
    setSeeds((s) => s.filter((seed) => seedKey(seed) !== key));

  async function submit() {
    setSubmitting(true);
    const input: BriefInput = {
      text: "",
      durationS: DURATION_S,
      seeds: toBriefSeeds(seeds),
    };
    const result = await api.createDraft({ creationMethod: "artist", input });
    if (!result.ok) {
      setSubmitting(false);
      toast("Try again.");
      return;
    }
    const draftId = result.value.draft.draft.id;
    savePendingBrief(draftId, input);
    void api
      .sendEvent({
        name: "brief_submitted",
        draftId,
        props: { entry: "artist" },
      })
      .catch(() => {});
    router.push(`/d/${draftId}`);
  }

  return (
    <main className="flex w-full max-w-[720px] flex-col gap-6 self-center px-5 py-8">
      <h1 className="m-0 text-heading font-bold">Start with an artist</h1>

      <div className="relative">
        <Input
          label="Artist"
          placeholder="Artist"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded ? optionId(active) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Artists"
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-10 m-0 list-none border-2 border-t-0 border-fg bg-bg p-0"
        >
          {choices.map((option, i) => (
            <li
              key={
                option.kind === "catalog"
                  ? `artist:${option.artist.id}`
                  : "typed"
              }
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the input, so the list stays open.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-4 px-4 py-3",
                i === active && "bg-fg text-bg",
              )}
            >
              <span className="font-bold">
                {option.kind === "catalog"
                  ? option.artist.name
                  : `Add “${option.name}”`}
              </span>
              {option.kind === "catalog" && (
                <span className="text-secondary tabular-nums">
                  {performances(option.artist.eligibleCount)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {seeds.length > 0 && (
        <ul aria-label="Seeds" className="m-0 list-none border-b border-fg p-0">
          {seeds.map((seed) => (
            <SeedRow
              key={seedKey(seed)}
              seed={seed}
              onToggle={() => toggle(seedKey(seed))}
              onRemove={() => remove(seedKey(seed))}
              onAdd={(artist) => choose({ kind: "catalog", artist })}
              added={(id) =>
                seeds.some((s) => s.kind === "catalog" && s.artistId === id)
              }
            />
          ))}
        </ul>
      )}

      <Button
        variant="primary"
        size="lg"
        disabled={seeds.length === 0 || submitting}
        onClick={submit}
      >
        Make playlist
      </Button>
    </main>
  );
}

function SeedRow({
  seed,
  onToggle,
  onRemove,
  onAdd,
  added,
}: {
  seed: Seed;
  onToggle: () => void;
  onRemove: () => void;
  onAdd: (artist: TypeaheadArtist) => void;
  added: (id: number) => boolean;
}) {
  const nothingToPlay = seed.kind === "catalog" && seed.eligibleCount === 0;
  const closest =
    seed.kind === "catalog" ? seed.closest.filter((a) => !added(a.id)) : [];
  return (
    <li className="flex flex-col gap-3 border-t border-fg py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-title font-bold">{seed.name}</span>
          <span className="text-secondary text-muted">
            {seed.kind === "influence"
              ? "Not in our catalog yet. We’ll use them as a reference."
              : nothingToPlay
                ? "Nothing of theirs can play right now."
                : performances(seed.eligibleCount)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Chip
            pressed={
              canMustInclude(seed) &&
              seed.kind === "catalog" &&
              seed.mustInclude
            }
            disabled={!canMustInclude(seed)}
            onClick={onToggle}
            aria-label={`Must include ${seed.name}`}
            className="disabled:border-subtle disabled:text-muted disabled:hover:bg-transparent"
          >
            Must include
          </Chip>
          <Button
            size="sm"
            aria-label={`Remove ${seed.name}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>
      {closest.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="meta">Closest</span>
          {closest.map((artist) => (
            <Button
              key={artist.id}
              size="sm"
              aria-label={`Add ${artist.name}`}
              onClick={() => onAdd(artist)}
            >
              {artist.name}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
