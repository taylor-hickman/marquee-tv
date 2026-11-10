import { useState } from "react";
import type { PerformanceCard } from "@/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { List } from "@/components/ui/list-row";
import { clock, total } from "./format";
import type { Run } from "./handoff";
import { artistNames, Thumbnail } from "./performance-card";

// The picks in the order added, their running total, and the two ways into
// the editor (J4 step 3). A side column from md up; on a phone a bar on the
// bottom edge that opens to show the list.
export function Drawer({
  picks,
  busy,
  onRemove,
  onOpen,
}: {
  picks: PerformanceCard[];
  busy: boolean;
  onRemove: (card: PerformanceCard) => void;
  onOpen: (run: Run) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const empty = picks.length === 0;
  return (
    <aside
      aria-labelledby="drawer-heading"
      className={cn(
        "fixed inset-x-0 bottom-0 z-[5] flex max-h-[85dvh] flex-col gap-4 overflow-y-auto border-t-2 border-fg bg-bg px-5 pt-4 pb-6",
        "md:sticky md:top-5 md:max-h-[calc(100dvh-2.5rem)] md:self-start md:border-2 md:p-5",
        empty && "max-md:hidden",
      )}
    >
      <div className="flex items-baseline justify-between">
        <h2 id="drawer-heading" className="meta m-0 text-fg">
          Playlist · {picks.length}
        </h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="drawer-list"
          onClick={() => setExpanded(!expanded)}
          className="text-secondary font-medium underline underline-offset-4 md:hidden"
        >
          {expanded ? "Close" : "Open"}
        </button>
      </div>
      <div id="drawer-list" className={cn(!expanded && "max-md:hidden")}>
        {!empty && (
          <List>
            {picks.map((card) => (
              <li
                key={card.id}
                className="flex items-center gap-3 border-t border-fg py-3"
              >
                <div className="h-[54px] w-24 flex-none overflow-hidden bg-subtle">
                  <Thumbnail card={card} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-secondary leading-[1.2] font-bold">
                    {artistNames(card)}
                  </div>
                  <div className="text-meta tracking-normal text-muted">
                    {card.series.name}
                  </div>
                </div>
                <span className="text-meta tracking-normal tabular-nums">
                  {clock(card.durationS)}
                </span>
                <Button size="sm" onClick={() => onRemove(card)}>
                  Remove
                </Button>
              </li>
            ))}
          </List>
        )}
      </div>
      <p className="m-0 text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
        {total(picks.map((p) => p.durationS))}
      </p>
      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          disabled={empty || busy}
          onClick={() => onOpen(null)}
        >
          Edit
        </Button>
        <Button disabled={empty || busy} onClick={() => onOpen("fill")}>
          Let AI fill the rest
        </Button>
      </div>
    </aside>
  );
}
