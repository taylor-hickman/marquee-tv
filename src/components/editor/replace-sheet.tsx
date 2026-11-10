import type { PerformanceCard } from "@/contracts";
import { clock } from "@/components/browser/format";
import { artistNames } from "@/components/browser/performance-card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

// Replace one (J2 step 3): up to three alternatives matched on the slot's
// energy and length, from the catalog with no model call (architecture 6.3).
export function ReplaceSheet({
  replacing,
  onChoose,
  onClose,
}: {
  replacing: {
    card: PerformanceCard;
    options: PerformanceCard[] | null;
  } | null;
  onChoose: (option: PerformanceCard) => void;
  onClose: () => void;
}) {
  const name = replacing ? artistNames(replacing.card) : "";
  const options = replacing?.options;
  return (
    <Sheet
      open={replacing !== null}
      onClose={onClose}
      label={`Replace ${name}`}
    >
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-title font-bold">Replace {name}</h2>
        {!options ? (
          <div aria-busy="true" className="flex flex-col gap-2">
            <Skeleton className="h-control w-full" />
            <Skeleton className="h-control w-full" />
            <Skeleton className="h-control w-full" />
          </div>
        ) : options.length === 0 ? (
          <p className="m-0 text-muted">Nothing fits this slot.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => onChoose(option)}
                  className="flex w-full items-baseline justify-between gap-4 border border-fg px-4 py-3 text-left hover:bg-subtle"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">{artistNames(option)}</span>
                    <span className="text-secondary text-muted">
                      {option.series.name}
                    </span>
                  </span>
                  <span className="text-secondary tabular-nums">
                    {clock(option.durationS)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Sheet>
  );
}
