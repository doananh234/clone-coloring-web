"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../../lib/icon";

export interface DropdownItem {
  id: string;
  label?: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  header?: ReactNode;
  align?: "start" | "end";
  width?: number;
}

export function Dropdown({ trigger, items, header, align = "end", width = 240 }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="mo-dd" ref={ref}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((o) => !o)}
        style={{ display: "inline-flex", cursor: "pointer" }}
      >
        {trigger}
      </span>
      {open && (
        <div className={`mo-dd__panel mo-dd__panel--${align}`} style={{ minWidth: width }}>
          {header && <div className="mo-dd__header">{header}</div>}
          {items.map((it) =>
            it.divider ? (
              <div key={it.id} className="mo-dd__divider" />
            ) : (
              <button
                key={it.id}
                type="button"
                className={["mo-dd__item", it.danger && "mo-dd__item--danger"]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.icon && <Icon name={it.icon} size={15} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block" }}>{it.label}</span>
                  {it.sub && <span className="mo-dd__item-sub">{it.sub}</span>}
                </span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
