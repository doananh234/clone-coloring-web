"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Avatar } from "../ui/avatar";
import { NAV, isNavActive } from "./nav-config";
import { useJobCounts, attentionJobCount } from "../../data/use-job-counts";

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Called when a nav link is chosen (used to close the mobile drawer). */
  onNavigate?: () => void;
}

function Wordmark({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.03em",
          color: "var(--volt-500)",
        }}
      >
        c<span style={{ color: "#fff" }}>.</span>
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.03em",
          color: "var(--volt-500)",
        }}
      >
        colorpress<span style={{ color: "#fff" }}>.</span>
      </span>
      <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>Coloring book studio</span>
    </div>
  );
}

export function Sidebar({ collapsed, onToggleCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const attention = attentionJobCount(useJobCounts());
  // Live badge per nav item (jobs → # needing action: errors + waiting-to-confirm; 0 hides it).
  const badgeFor = (id: string): number | undefined => (id === "jobs" && attention > 0 ? attention : undefined);

  return (
    <div
      style={{
        width: collapsed ? 68 : 248,
        height: "100%",
        background: "var(--sidebar)",
        color: "var(--sidebar-foreground)",
        display: "flex",
        flexDirection: "column",
        transition: "width var(--dur-med) var(--ease-out)",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          gap: 8,
          padding: "18px 16px 8px",
          minHeight: 64,
        }}
      >
        {!collapsed && <Wordmark collapsed={false} />}
        <button
          type="button"
          className="mo-iconbtn"
          style={{ width: 30, height: 30 }}
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          title={collapsed ? "Mở rộng" : "Thu gọn"}
        >
          <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} size={18} />
        </button>
      </div>

      {/* nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {NAV.map((sec) => (
          <div key={sec.section}>
            {!collapsed && <div className="mo-nav__section">{sec.section}</div>}
            {collapsed && <div style={{ height: 12 }} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {sec.items.map((it) => {
                const active = isNavActive(it.href, pathname);
                return (
                  <Link
                    key={it.id}
                    href={it.href}
                    onClick={onNavigate}
                    className={`mo-nav__item${active ? " mo-nav__item--active" : ""}`}
                    style={collapsed ? { justifyContent: "center", padding: "9px 0" } : undefined}
                    title={collapsed ? it.label : undefined}
                  >
                    <Icon name={it.icon} size={19} />
                    {!collapsed && <span style={{ flex: 1 }}>{it.label}</span>}
                    {!collapsed && badgeFor(it.id) != null && (
                      <span className="mo-nav__badge">{badgeFor(it.id)}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* footer */}
      <div style={{ padding: "10px 16px 18px", borderTop: "1px solid var(--carbon-800)" }}>
        {collapsed ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
            <Avatar name="Bao Nguyen" size="sm" />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10 }}>
            <Avatar name="Bao Nguyen" size="sm" />
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Bao Nguyen</div>
              <div style={{ fontSize: 11, color: "var(--neutral-500)" }}>Admin</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
            <button
              type="button"
              className="mo-iconbtn"
              style={{ width: 30, height: 30, transform: "rotate(180deg)" }}
              onClick={onToggleCollapse}
              aria-label="Mở rộng sidebar"
            >
              <Icon name="chevrons-left" size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
