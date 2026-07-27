import type { ReactNode } from "react";

export type BadgeTone = "success" | "info" | "warning" | "danger" | "neutral" | "carbon";

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", dot = false, children, className }: BadgeProps) {
  return (
    <span className={["mo-badge", `mo-badge--${tone}`, className].filter(Boolean).join(" ")}>
      {dot && <span className="mo-badge__dot" />}
      {children}
    </span>
  );
}
