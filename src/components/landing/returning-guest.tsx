"use client";

import Link from "next/link";
import type { DraftView, PerformanceCard } from "@/contracts";
import { Button, buttonClass } from "@/components/ui/button";
import type { ApiClient } from "@/lib/client/api";

// The free set above the prompt (PRD 7.7, J6): title, runtime, Play on YouTube
// and Open, from the draft cached in local storage.

// PRD 7.5: at most 50 videos per handoff. A local copy until C3's
// src/lib/handoff-url.ts lands; E5 moves this card onto it with the sheet.
const PART_SIZE = 50;

// The revision's tracks in order, skipping any the cache has no card for.
export function playable(view: DraftView): PerformanceCard[] {
  const byId = new Map(view.performances.map((p) => [p.id, p]));
  return (view.revision?.items ?? []).flatMap((item) => {
    const card = byId.get(item.performance_id);
    return card ? [card] : [];
  });
}

function runtime(seconds: number) {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${String(m % 60).padStart(2, "0")} m` : `${m} m`;
}

export function ReturningGuest({
  draft: view,
  api,
}: {
  draft: DraftView;
  api: ApiClient;
}) {
  const tracks = playable(view);
  const parts: string[] = [];
  for (let i = 0; i < tracks.length; i += PART_SIZE) {
    const ids = tracks.slice(i, i + PART_SIZE).map((t) => t.videoId);
    parts.push(
      `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`,
    );
  }
  const seconds = tracks.reduce((sum, t) => sum + (t.durationS ?? 0), 0);
  const { id, title } = view.draft;
  const revision = view.revision!.number;

  // Rule 4: window.open runs first and synchronously, then the events.
  function play(part: number) {
    window.open(parts[part], "_blank", "noopener");
    api
      .sendEvent({
        name: "handoff_opened",
        draftId: id,
        revision,
        part: part + 1,
        startIndex: 0,
      })
      .catch(() => {});
    api.sendEvent({ name: "library_replayed", draftId: id }).catch(() => {});
  }

  return (
    <section
      aria-labelledby="returning-title"
      className="flex flex-col gap-4 border-2 border-fg p-5 md:flex-row md:items-center md:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2
          id="returning-title"
          className="m-0 text-heading font-bold break-words"
        >
          {title ?? "Untitled"}
        </h2>
        <span className="text-meta font-medium text-muted tabular-nums">
          {runtime(seconds)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {parts.map((_, part) => (
          <Button key={part} variant="primary" onClick={() => play(part)}>
            {parts.length === 1 ? "Play on YouTube" : `Play part ${part + 1}`}
          </Button>
        ))}
        <Link href={`/d/${id}`} className={buttonClass()}>
          Open
        </Link>
      </div>
    </section>
  );
}
