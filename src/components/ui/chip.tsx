import type { ComponentProps } from "react";
import { cn } from "./cn";

// A toggle. Selected inverts; never amber (Foundations).
export function Chip({
  pressed,
  className,
  ...props
}: Omit<ComponentProps<"button">, "type" | "aria-pressed"> & {
  pressed: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-control-sm items-center border border-fg px-4 text-secondary font-medium whitespace-nowrap",
        "bg-transparent text-fg hover:bg-subtle",
        "aria-pressed:bg-fg aria-pressed:text-bg",
        className,
      )}
      {...props}
    />
  );
}
