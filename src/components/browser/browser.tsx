"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  CatalogSearchResponse,
  PerformanceCard as Card,
} from "@/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { createApiClient } from "@/lib/client/api";
import { Drawer } from "./drawer";
import { draftFromPicks, editorPath, type Run } from "./handoff";
import { PerformanceCard } from "./performance-card";

const api = createApiClient();

// Typing settles before a search goes out.
const SETTLE_MS = 250;

type Filter = "publisherId" | "seriesId" | "artistId";
type Query = { q: string } & Partial<Record<Filter, number>>;
type Options = Record<Filter, Map<number, string>>;

// Filter options are the publishers, series and artists of every card seen so
// far: /api/catalog/search is the browser's only catalog read.
function learn(options: Options, cards: Card[]): Options {
  const next = {
    publisherId: new Map(options.publisherId),
    seriesId: new Map(options.seriesId),
    artistId: new Map(options.artistId),
  };
  for (const card of cards) {
    next.publisherId.set(card.publisher.id, card.publisher.name);
    next.seriesId.set(card.series.id, card.series.name);
    for (const a of card.artists) next.artistId.set(a.id, a.name);
  }
  return next;
}

const noOptions: Options = {
  publisherId: new Map(),
  seriesId: new Map(),
  artistId: new Map(),
};

const filters: { key: Filter; label: string }[] = [
  { key: "publisherId", label: "Publisher" },
  { key: "seriesId", label: "Series" },
  { key: "artistId", label: "Artist" },
];

export function Browser() {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState<Query>({ q: "" });
  const [results, setResults] = useState<CatalogSearchResponse | null>(null);
  const [options, setOptions] = useState<Options>(noOptions);
  const [picks, setPicks] = useState<Card[]>([]);
  const [busy, setBusy] = useState(false);

  function show(page: CatalogSearchResponse, append: boolean) {
    setResults((prev) =>
      append && prev
        ? {
            ...page,
            performances: [...prev.performances, ...page.performances],
          }
        : page,
    );
    setOptions((prev) => learn(prev, page.performances));
  }

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await api.searchCatalog({
        ...query,
        q: query.q.trim() || undefined,
      });
      if (!stale && result.ok) show(result.value, false);
    }, SETTLE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function more(offset: number) {
    const result = await api.searchCatalog({
      ...query,
      q: query.q.trim() || undefined,
      offset,
    });
    if (result.ok) show(result.value, true);
  }

  const picked = new Set(picks.map((p) => p.id));
  const toggle = (card: Card) =>
    setPicks((prev) =>
      prev.some((p) => p.id === card.id)
        ? prev.filter((p) => p.id !== card.id)
        : [...prev, card],
    );

  async function open(run: Run) {
    setBusy(true);
    const id = await draftFromPicks(
      api,
      picks.map((p) => p.id),
    );
    if (id) {
      router.push(editorPath(id, run));
    } else {
      setBusy(false);
      toast("Not saved. Try again.");
    }
  }

  return (
    <main className="flex flex-col gap-8 px-5 pt-6 pb-48 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:pb-10">
      <div className="flex min-w-0 flex-col gap-5">
        <h1 className="m-0 text-[40px] leading-none font-extrabold tracking-[-0.03em]">
          Browse
        </h1>
        <Input
          label="Search"
          type="search"
          placeholder="Search"
          value={query.q}
          onChange={(e) => setQuery({ ...query, q: e.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          {filters.map(({ key, label }) => (
            <select
              key={key}
              aria-label={label}
              value={query[key] ?? ""}
              onChange={(e) =>
                setQuery({
                  ...query,
                  [key]: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="h-control-sm max-w-full rounded-none border border-fg bg-bg px-3 text-meta font-medium text-fg"
            >
              <option value="">{label}</option>
              {[...options[key]]
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          ))}
        </div>
        <section aria-label="Performances" aria-busy={results === null}>
          {results === null ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="aspect-video" />
              ))}
            </div>
          ) : results.performances.length === 0 ? (
            <p className="m-0 text-secondary">
              Nothing matches. Check the spelling or clear a filter.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-3">
              {results.performances.map((card) => (
                <PerformanceCard
                  key={card.id}
                  card={card}
                  picked={picked.has(card.id)}
                  onToggle={() => toggle(card)}
                />
              ))}
            </div>
          )}
          {results?.nextOffset && (
            <Button
              size="sm"
              className="mt-6 w-full"
              onClick={() => more(results.nextOffset!)}
            >
              More
            </Button>
          )}
        </section>
      </div>
      <Drawer picks={picks} busy={busy} onRemove={toggle} onOpen={open} />
    </main>
  );
}
