import type { IconName } from "../../lib/icon";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  badge?: number;
  /** Only shown to operators with role "admin" (filtered in the sidebar). */
  adminOnly?: boolean;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

/** Base path for all coloring routes (root — the Motio admin is the main site). */
export const COLORING_BASE = "";
/** Home/overview path (COLORING_BASE is "" so home needs an explicit "/"). */
export const COLORING_HOME = "/";

/** Sidebar structure, ported from the design's navItems. */
export const NAV: NavSection[] = [
  {
    section: "Vận hành",
    items: [
      { id: "overview", label: "Tổng quan", href: COLORING_HOME, icon: "layout-dashboard" },
      { id: "jobs", label: "Clone jobs", href: `${COLORING_BASE}/jobs`, icon: "copy", adminOnly: true },
      { id: "books", label: "Sách", href: `${COLORING_BASE}/books`, icon: "book-open" },
      { id: "queue", label: "Hàng đợi của tôi", href: `${COLORING_BASE}/queue`, icon: "layout-grid" },
    ],
  },
  {
    section: "Nhóm quản lý",
    items: [
      { id: "home", label: "Home", href: `${COLORING_BASE}/home`, icon: "layout-grid", adminOnly: true },
      { id: "storyhub", label: "Story", href: `${COLORING_BASE}/story`, icon: "pen-line", adminOnly: true },
      { id: "libhub", label: "Thư viện", href: `${COLORING_BASE}/library`, icon: "folder", adminOnly: true },
      { id: "stylehub", label: "Phong cách", href: `${COLORING_BASE}/styles`, icon: "palette" },
      {
        id: "syshub",
        label: "Kênh bán & hệ thống",
        href: `${COLORING_BASE}/system`,
        icon: "settings",
        adminOnly: true,
      },
      { id: "fonts", label: "Quản lý font", href: `${COLORING_BASE}/fonts`, icon: "type" },
      { id: "cover-overlays", label: "Bố cục chữ bìa", href: `${COLORING_BASE}/cover-overlays`, icon: "layers" },
      { id: "accounts", label: "Tài khoản", href: `${COLORING_BASE}/accounts`, icon: "shield", adminOnly: true },
    ],
  },
];

/** True when `href` should be highlighted for the current pathname. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === COLORING_HOME) return pathname === COLORING_HOME;
  return pathname === href || pathname.startsWith(`${href}/`);
}
