import { useId } from "react";
import type { PerformanceCard as Card } from "@/contracts";
import { Button } from "@/components/ui/button";
import { clock } from "./format";

export const artistNames = (card: Card) =>
  card.artists.map((a) => a.name).join(" & ");

// The thumbnail links out to YouTube; nothing from it reaches the model.
export function Thumbnail({ card }: { card: Card }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${card.videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${artistNames(card)} on YouTube`}
      className="block size-full"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- i.ytimg.com serves its own sizes */}
      <img
        src={`https://i.ytimg.com/vi/${card.videoId}/mqdefault.jpg`}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
    </a>
  );
}

// PRD 7.3: thumbnail, artist, title, publisher, series, duration, upload year.
export function PerformanceCard({
  card,
  picked,
  onToggle,
}: {
  card: Card;
  picked: boolean;
  onToggle: () => void;
}) {
  const heading = useId();
  const facts = [
    clock(card.durationS),
    card.publishedAt?.slice(0, 4) ?? "",
  ].filter(Boolean);
  return (
    <article aria-labelledby={heading} className="flex min-w-0 flex-col gap-2">
      <div className="aspect-video overflow-hidden bg-subtle">
        <Thumbnail card={card} />
      </div>
      <h2
        id={heading}
        className="m-0 mt-1 text-secondary leading-[1.2] font-bold"
      >
        {artistNames(card)}
      </h2>
      {card.title && (
        <p className="m-0 text-meta tracking-normal">{card.title}</p>
      )}
      <p className="m-0 text-meta tracking-normal text-muted">
        {card.publisher.name} · {card.series.name}
        {facts.length > 0 && ` · ${facts.join(" · ")}`}
      </p>
      <Button size="sm" className="mt-auto w-full" onClick={onToggle}>
        {picked ? "Remove" : "Add"}
      </Button>
    </article>
  );
}
