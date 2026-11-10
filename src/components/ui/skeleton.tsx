import { cn } from "./cn";

// A placeholder block. Size it with className; the container it fills carries
// aria-busy, so the block itself is hidden from assistive tech.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-subtle motion-safe:animate-pulse", className)}
    />
  );
}
