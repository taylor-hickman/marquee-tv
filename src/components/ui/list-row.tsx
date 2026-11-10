import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// One row everywhere: editor, browser, library (Foundations). On a phone the
// actions sit under the row; from md up they share its line. Pinned rows carry
// a 4 px bar in the mark colour.
export function List({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      className={cn("m-0 list-none border-b border-fg p-0", className)}
      {...props}
    />
  );
}

export function ListRow({
  position,
  title,
  subtitle,
  duration,
  thumbnail,
  actions,
  pinned = false,
}: {
  position: number;
  title: ReactNode;
  subtitle?: ReactNode;
  duration?: ReactNode;
  // A link or image filling the 16:9 box; the box stays as a placeholder without one.
  thumbnail?: ReactNode;
  actions?: ReactNode;
  pinned?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 border-t border-fg py-4",
        "md:grid md:grid-cols-[160px_minmax(0,1fr)_64px_auto] md:items-center md:gap-5",
        pinned && "border-l-4 border-l-mark pl-3",
      )}
    >
      <div className="flex items-start gap-3 md:contents">
        <div className="relative h-[68px] w-[120px] flex-none overflow-hidden bg-subtle md:h-[90px] md:w-40">
          {thumbnail}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="meta tabular-nums">
            {String(position).padStart(2, "0")}
          </span>
          <div className="text-body leading-[1.2] font-bold md:text-title">
            {title}
          </div>
          {subtitle && (
            <div className="text-secondary text-muted">{subtitle}</div>
          )}
        </div>
        <div className="text-secondary font-medium whitespace-nowrap tabular-nums">
          {duration}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </li>
  );
}
