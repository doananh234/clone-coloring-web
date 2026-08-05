"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Dropdown, type DropdownItem } from "../ui/dropdown";
import { COLORING_BASE } from "./nav-config";
import { useColoringAuth } from "../../hooks/coloring-auth";
import { useJobCounts, runningJobCount } from "../../data/use-job-counts";

export interface HeaderCrumb {
  label: string;
  href?: string;
}

export interface HeaderProps {
  pageTitle: string;
  crumbs?: HeaderCrumb[];
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenNav: () => void;
}

export function Header({ pageTitle, crumbs, theme, onToggleTheme, onOpenNav }: HeaderProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const submitSearch = () => {
    const q = search.trim();
    if (q) router.push(`${COLORING_BASE}/books?q=${encodeURIComponent(q)}`);
  };
  const { user, logout } = useColoringAuth();
  const running = runningJobCount(useJobCounts());
  const hasCrumbs = !!crumbs && crumbs.length > 1;
  const displayName = user?.name || "Người dùng";
  const userHeader = user?.email ? `${displayName} · ${user.email}` : displayName;

  const notifItems: DropdownItem[] = [
    {
      id: "n1",
      label: "JOB-1040 chờ xác nhận tạo book",
      sub: "ocean-buddies.pdf · 10:38",
      icon: "copy",
      onClick: () => router.push(`${COLORING_BASE}/jobs`),
    },
    {
      id: "n2",
      label: "JOB-1038 lỗi analyze",
      sub: "space-cats.pdf · 09:47",
      icon: "alert-triangle",
      onClick: () => router.push(`${COLORING_BASE}/jobs`),
    },
    {
      id: "n3",
      label: "Etsy sync hoàn tất",
      sub: "42 listings · 10:22",
      icon: "store",
      onClick: () => router.push(`${COLORING_BASE}/system`),
    },
    {
      id: "n4",
      label: "Chi phí AI đạt 72% ngân sách",
      sub: "$214.60 / $300.00 · hôm nay",
      icon: "wallet",
      onClick: () => router.push(`${COLORING_BASE}/system`),
    },
  ];

  const userItems: DropdownItem[] = [
    { id: "profile", label: "Hồ sơ", icon: "user" },
    { id: "settings", label: "Cài đặt hệ thống", icon: "settings", onClick: () => router.push(`${COLORING_BASE}/system`) },
    { id: "d1", divider: true },
    {
      id: "appearance",
      label: theme === "dark" ? "Chuyển sang Light" : "Chuyển sang Dark",
      icon: theme === "dark" ? "sun" : "moon",
      onClick: onToggleTheme,
    },
    { id: "d2", divider: true },
    { id: "out", label: "Đăng xuất", icon: "log-out", danger: true, onClick: () => logout() },
  ];

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <button type="button" className="mo-hbtn" onClick={onOpenNav} aria-label="Bật/tắt menu">
        <Icon name="menu" size={20} />
      </button>

      {hasCrumbs ? (
        <nav style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }} aria-label="Breadcrumb">
          {crumbs!.map((c, i) => {
            const isLast = i === crumbs!.length - 1;
            return (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {i > 0 && <Icon name="crumb-sep" size={14} color="var(--muted-foreground)" />}
                {isLast || !c.href ? (
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", color: isLast ? "var(--foreground)" : "var(--muted-foreground)", whiteSpace: "nowrap" }}>{c.label}</span>
                ) : (
                  <button type="button" onClick={() => router.push(c.href!)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{c.label}</button>
                )}
              </span>
            );
          })}
        </nav>
      ) : (
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>{pageTitle}</h2>
      )}

      <div style={{ flex: 1 }} />

      <div className="mo-desktop-only" style={{ width: 280, maxWidth: "28vw" }}>
        <Input
          icon="search"
          placeholder="Tìm sách… (Enter)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
        />
      </div>

      {running > 0 && (
        <div className="mo-desktop-only">
          <Badge tone="success" dot>
            {running} job đang chạy
          </Badge>
        </div>
      )}

      <Dropdown
        align="end"
        width={330}
        header="Thông báo"
        items={notifItems}
        trigger={
          <span className="mo-hbtn" title="Thông báo">
            <Icon name="bell" size={18} />
            <span className="mo-hbtn__count">4</span>
          </span>
        }
      />

      <button type="button" className="mo-hbtn" onClick={onToggleTheme} aria-label="Đổi giao diện">
        <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
      </button>

      <Dropdown
        align="end"
        width={260}
        header={userHeader}
        items={userItems}
        trigger={
          <span style={{ display: "inline-flex", cursor: "pointer" }} title="Tài khoản">
            <Avatar name={displayName} size="md" />
          </span>
        }
      />
    </header>
  );
}
