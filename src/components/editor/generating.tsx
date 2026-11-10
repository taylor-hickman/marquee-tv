import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { stepStatus, steps, type Progress } from "./progress";

// `Generating · in progress` and `Generating · error`: the person's words, the
// brief as the curator read them, and the steps from the stream.
export function Generating({
  quote,
  progress,
  onRetry,
}: {
  quote: string;
  progress: Progress;
  onRetry: () => void;
}) {
  return (
    <main
      aria-busy={!progress.failure}
      className="flex max-w-[960px] flex-col gap-8 px-5 pt-6 pb-8 md:gap-10 md:px-16 md:pt-14 md:pb-12"
    >
      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-heading font-bold md:text-[40px] md:leading-[1.12]">
          “{quote}”
        </h1>
        <p role="status" className="meta m-0 min-h-[1.3em]">
          {progress.echo}
        </p>
      </div>
      <ol aria-label="Progress" className="m-0 flex list-none flex-col p-0">
        {steps.map((step, index) => {
          const status = stepStatus(progress, index);
          const current = status === "Now" || status === "Failed";
          return (
            <li
              key={step}
              aria-current={status === "Now" ? "step" : undefined}
              className="flex items-baseline gap-4 border-t border-fg py-3.5"
            >
              <span className={cn("meta min-w-16", current && "text-fg")}>
                {status}
              </span>
              <span
                className={cn(
                  current && "font-bold",
                  status === "Next" && "text-muted",
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
      {progress.failure && (
        <div role="alert" className="flex flex-col items-start gap-4">
          <h2 className="m-0 text-heading font-bold">{progress.failure}</h2>
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </main>
  );
}
