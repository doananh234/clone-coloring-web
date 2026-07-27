import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only button (40x40 / 32x32). */
  iconOnly?: boolean;
  children?: ReactNode;
}

const cls = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  size = "md",
  iconOnly = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cls(
        "mo-btn",
        `mo-btn--${variant}`,
        `mo-btn--${size}`,
        iconOnly && "mo-btn--icon",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
