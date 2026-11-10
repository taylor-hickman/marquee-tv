import type { ComponentProps } from "react";
import { cn } from "./cn";

// Square, words not icons (Foundations). Primary is the one amber action on a
// screen; secondary is outlined. `icon` is the 44 px square and needs an
// aria-label.
export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const sizes: Record<ButtonSize, string> = {
  sm: "h-control-sm border px-4 text-meta tracking-normal",
  md: "h-control border-2 px-5 text-body",
  lg: "h-control-lg border-2 px-6 text-title",
  icon: "size-control-sm border p-0",
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-accent bg-accent text-on-accent font-bold",
  secondary: "border-fg bg-transparent text-fg",
};

// For links that look like buttons, such as Play on YouTube.
export function buttonClass({
  variant = "secondary",
  size = "md",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-none leading-none whitespace-nowrap no-underline",
    size === "sm" && variant === "secondary" ? "font-medium" : "font-bold",
    sizes[size],
    variants[variant],
    "hover:border-fg hover:bg-fg hover:text-bg",
    "active:border-fg active:shadow-[inset_0_0_0_3px_var(--bg)]",
    "disabled:border-subtle disabled:bg-subtle disabled:text-muted disabled:shadow-none",
  );
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={cn(buttonClass({ variant, size }), className)}
      {...props}
    />
  );
}
