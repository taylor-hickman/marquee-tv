import { useEffect, useRef, useState } from "react";
import type {
  DraftId,
  Op,
  PerformanceCard,
  PerformanceId,
  RevisionItem,
} from "@/contracts";
import { clock } from "@/components/browser/format";
import { artistNames, Thumbnail } from "@/components/browser/performance-card";
import { Button } from "@/components/ui/button";
import { List, ListRow } from "@/components/ui/list-row";
import type { ApiClient } from "@/lib/client/api";
import { ReplaceSheet } from "./replace-sheet";

// Journeys 6: what each edit records.
export type EditEvent =
  "item_pinned" | "item_removed" | "item_replaced" | "item_moved";

export type OnOps = (
  ops: Op[],
  event: EditEvent,
  performanceId: PerformanceId,
) => Promise<boolean>;

// The ordered list (PRD 7.4). Rows are in DOM order as on screen, so a screen
// reader reads them in the order they play. Drag is the pointer's way to move
// a row on desktop; Move up and Move down are everyone's, keyboard included.
export function TrackList({
  draftId,
  items,
  cards,
  api,
  onOps,
  toast,
}: {
  draftId: DraftId;
  items: RevisionItem[];
  cards: Map<PerformanceId, PerformanceCard>;
  api: ApiClient;
  onOps: OnOps;
  toast: (message: string) => void;
}) {
  const [dragging, setDragging] = useState<PerformanceId | null>(null);
  const [replacing, setReplacing] = useState<{
    index: number;
    card: PerformanceCard;
    options: PerformanceCard[] | null;
  } | null>(null);
  // A control to focus once the list re-renders, as `${id}-${control}`: a
  // moved row keeps the button that moved it focused.
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    const key = focusNext.current;
    focusNext.current = null;
    if (key)
      document.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus();
  }, [items]);

  async function edit(
    op: Op,
    event: EditEvent,
    id: PerformanceId,
    focus?: string,
  ) {
    focusNext.current = focus ?? null;
    const ok = await onOps([op], event, id);
    if (!ok) focusNext.current = null;
    return ok;
  }

  function move(id: PerformanceId, to: number, control?: "up" | "down") {
    // At either end the pressed button is disabled; its partner takes focus.
    const focus =
      control === "up" && to === 0
        ? "down"
        : control === "down" && to === items.length - 1
          ? "up"
          : control;
    return edit(
      { op: "move", performance_id: id, to_index: to },
      "item_moved",
      id,
      focus && `${id}-${focus}`,
    );
  }

  async function openReplace(index: number, card: PerformanceCard) {
    setReplacing({ index, card, options: null });
    const result = await api.replaceOptions(draftId, index).catch(() => null);
    if (!result?.ok) {
      setReplacing(null);
      toast("Couldn't load alternatives. Try again.");
      return;
    }
    setReplacing((r) =>
      r?.index === index ? { ...r, options: result.value.options } : r,
    );
  }

  return (
    <section aria-labelledby="tracks-heading" className="flex flex-col gap-3">
      <h2 id="tracks-heading" className="meta m-0">
        {items.length} {items.length === 1 ? "performance" : "performances"}
      </h2>
      <List
        aria-labelledby="tracks-heading"
        onDragOver={(e) => {
          if (dragging !== null) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const row = (e.target as HTMLElement).closest("li");
          const to = row ? [...e.currentTarget.children].indexOf(row) : -1;
          const from = items.findIndex((i) => i.performance_id === dragging);
          if (dragging !== null && to >= 0 && to !== from)
            void move(dragging, to);
          setDragging(null);
        }}
      >
        {items.map((item, index) => {
          const id = item.performance_id;
          const card = cards.get(id);
          const pinned = item.pinned === "position";
          const neighbour = items[index + 1] ?? items[index - 1];
          return (
            <ListRow
              key={id}
              position={index + 1}
              pinned={pinned}
              thumbnail={card && <Thumbnail card={card} />}
              title={card ? artistNames(card) : "Unavailable"}
              subtitle={
                card &&
                [card.title, card.publisher.name].filter(Boolean).join(" · ")
              }
              duration={card && clock(card.durationS)}
              actions={
                <>
                  <span
                    aria-hidden="true"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(id));
                      setDragging(id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className="hidden size-control-sm cursor-grab items-center justify-center border border-fg text-title select-none md:inline-flex"
                  >
                    ≡
                  </span>
                  <Button
                    size="sm"
                    onClick={() =>
                      edit(
                        { op: pinned ? "unpin" : "pin", performance_id: id },
                        "item_pinned",
                        id,
                      )
                    }
                  >
                    {pinned ? "Unpin" : "Pin"}
                  </Button>
                  {card && (
                    <Button size="sm" onClick={() => openReplace(index, card)}>
                      Replace
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      edit(
                        { op: "remove", performance_id: id },
                        "item_removed",
                        id,
                        neighbour && `${neighbour.performance_id}-remove`,
                      )
                    }
                    data-focus={`${id}-remove`}
                  >
                    Remove
                  </Button>
                  <Button
                    size="icon"
                    aria-label="Move up"
                    disabled={index === 0}
                    data-focus={`${id}-up`}
                    onClick={() => move(id, index - 1, "up")}
                  >
                    ↑
                  </Button>
                  <Button
                    size="icon"
                    aria-label="Move down"
                    disabled={index === items.length - 1}
                    data-focus={`${id}-down`}
                    onClick={() => move(id, index + 1, "down")}
                  >
                    ↓
                  </Button>
                </>
              }
            />
          );
        })}
      </List>
      <ReplaceSheet
        replacing={replacing}
        onChoose={async (option) => {
          if (!replacing) return;
          const id = replacing.card.id;
          const ok = await edit(
            {
              op: "replace",
              performance_id: id,
              with_performance_id: option.id,
            },
            "item_replaced",
            id,
          );
          if (ok) setReplacing(null);
        }}
        onClose={() => setReplacing(null)}
      />
    </section>
  );
}
