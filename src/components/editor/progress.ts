import type { ErrorBody, StreamEvent } from "@/contracts";

// Where a generate, regenerate or fill run is, from its stream (architecture
// 6.2): started, the brief echo, candidates, then result or error. The result
// itself is the editor's to render; this tracks the steps before it.

export const steps = ["Brief", "Search", "Arc"] as const;

export type Progress = {
  // Index into `steps` of the step under way.
  step: number;
  echo: string | null;
  failure: string | null;
};

export const starting: Progress = { step: 0, echo: null, failure: null };

const unreachable = "We couldn't reach the catalog. Nothing is lost.";

export function advance(progress: Progress, event: StreamEvent): Progress {
  switch (event.type) {
    case "started":
      return starting;
    case "brief":
      return { ...progress, step: 1, echo: event.echo };
    case "candidates":
      return { ...progress, step: 2 };
    case "error":
      return { ...progress, failure: unreachable };
    case "result":
      return progress;
  }
}

export function stepStatus(progress: Progress, index: number) {
  if (index < progress.step) return "Done";
  if (index > progress.step) return "Next";
  return progress.failure ? "Failed" : "Now";
}

// What a refused run or write says. Null is a failure with no body: the
// network, or a route that answered something outside the contract.
export function failureMessage(
  error: ErrorBody | null,
  fallback = unreachable,
): string {
  switch (error?.error) {
    case "conflict":
      return "This set changed elsewhere. Showing the latest.";
    case "rate_limited":
      return `Too many runs. Try again in ${error.retryAfterS} s.`;
    case "run_cap_reached":
      return "No AI runs left on this set. Edits still work.";
    case "payment_required":
      return "This set needs a plan.";
    case "read_only":
      return "This set is read-only.";
    case "not_found":
      return "Set not found.";
    default:
      return fallback;
  }
}
