import { useId, type ComponentProps } from "react";
import { cn } from "./cn";

// Every field has a label for assistive tech and none on screen: the
// placeholder and the screen around it say what goes in (UI copy rule).
const field =
  "w-full rounded-none border-2 border-fg bg-bg text-fg placeholder:text-muted";

export function Input({
  label,
  className,
  id,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(field, "h-control min-w-0 px-4 text-body", className)}
        {...props}
      />
    </>
  );
}

export function TextArea({
  label,
  className,
  id,
  rows = 3,
  ...props
}: ComponentProps<"textarea"> & { label: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <textarea
        id={inputId}
        rows={rows}
        className={cn(
          field,
          "min-h-32 resize-none p-4 text-title leading-[1.3] font-medium",
          className,
        )}
        {...props}
      />
    </>
  );
}
