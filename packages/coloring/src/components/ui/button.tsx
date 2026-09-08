import { useCallback, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only button (40x40 / 32x32). */
  iconOnly?: boolean;
  /**
   * Force the loading state (spinner + disabled). Usually unnecessary: if the
   * onClick handler returns a Promise, the button shows the spinner and blocks
   * further clicks automatically until it settles. Use this for buttons wired to
   * an external pending flag (e.g. a react-query mutation's isPending).
   */
  loading?: boolean;
  children?: ReactNode;
}

const cls = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  size = "md",
  iconOnly = false,
  loading = false,
  className,
  type = "button",
  children,
  onClick,
  disabled,
  ...rest
}: ButtonProps) {
  // Auto-loading: when onClick returns a Promise, track it so EVERY async action
  // shows a spinner and can't be double-clicked — no per-screen wiring needed.
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const busy = loading || pending;

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (busy || disabled) return;
      const result = onClick?.(e) as unknown;
      if (result && typeof (result as { then?: unknown }).then === "function") {
        setPending(true);
        Promise.resolve(result).finally(() => {
          if (mounted.current) setPending(false);
        });
      }
    },
    [busy, disabled, onClick],
  );

  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cls(
        "mo-btn",
        `mo-btn--${variant}`,
        `mo-btn--${size}`,
        iconOnly && "mo-btn--icon",
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      {busy && <span className="mo-btn__spinner" aria-hidden="true" />}
      {!(iconOnly && busy) && children}
    </button>
  );
}
