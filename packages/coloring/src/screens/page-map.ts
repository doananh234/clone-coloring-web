/** Resolve the header title for a coloring route from its slug segments. */
export function resolvePageTitle(slug: string[]): string {
  const [top, sub] = slug;
  switch (top) {
    case undefined:
      return "Tổng quan";
    case "jobs":
      if (sub === "new") return "Tạo clone job";
      return sub ? "Chi tiết job" : "Clone jobs";
    case "books":
      if (sub === "new") return "Tạo sách mới";
      if (!sub) return "Sách";
      if (slug[2] === "edit") return "Sửa thông tin sách";
      if (slug[2] === "colorize") return "Tô màu AI";
      if (slug[2] === "cover") return "Cover editor";
      return "Chi tiết sách";
    case "story":
      return "Story";
    case "library": {
      const m: Record<string, string> = { characters: "Nhân vật", locations: "Bối cảnh", brands: "Brand", categories: "Danh mục" };
      if (slug[2] === "new") return sub === "brands" ? "Tạo brand" : "Tạo danh mục";
      return m[sub] || "Thư viện";
    }
    case "styles": {
      const m: Record<string, string> = { bwstyles: "B&W style", colorstyles: "Coloring style", extractbw: "Tạo B&W từ ảnh", extractcolor: "Tạo coloring từ ảnh" };
      return m[sub] || "Phong cách";
    }
    case "system":
      if (sub === "users") return "Người dùng & quyền";
      if (sub === "ai-cost") return "Chi phí AI & logs";
      if (sub === "settings") return "Cài đặt hệ thống";
      return "Kênh bán & hệ thống";
    case "etsy":
      return "Etsy listings";
    case "fonts":
      return "Quản lý font";
    case "cover-overlays":
      return "Quản lý bố cục chữ bìa";
    case "entity": {
      const map: Record<string, string> = {
        characters: "Nhân vật",
        locations: "Bối cảnh",
        "art-styles": "B&W style",
        "coloring-styles": "Coloring style",
        brands: "Brand",
        categories: "Danh mục",
      };
      const label = map[sub] || "Chi tiết";
      return slug[3] === "edit" ? `Sửa ${label.toLowerCase()}` : label;
    }
    default:
      return "Tổng quan";
  }
}

/** Which slugs have a real screen implemented so far (Phase 1: overview only). */
export function isOverview(slug: string[]): boolean {
  return slug.length === 0;
}

export interface Crumb {
  label: string;
  href?: string;
}

const BASE = "";
const ENTITY_PARENT: Record<string, Crumb> = {
  characters: { label: "Nhân vật", href: `${BASE}/library/characters` },
  locations: { label: "Bối cảnh", href: `${BASE}/library/locations` },
  "art-styles": { label: "B&W style", href: `${BASE}/styles/bwstyles` },
  "coloring-styles": { label: "Coloring style", href: `${BASE}/styles/colorstyles` },
  brands: { label: "Brand", href: `${BASE}/library/brands` },
  categories: { label: "Danh mục", href: `${BASE}/library/categories` },
};

/** Breadcrumb trail for the header. Top-level pages → single crumb (plain title). */
export function resolveCrumbs(slug: string[]): Crumb[] {
  const [top, sub] = slug;
  const title = resolvePageTitle(slug);
  if (!sub) return [{ label: title }];

  const TOP_PARENT: Record<string, Crumb> = {
    jobs: { label: "Clone jobs", href: `${BASE}/jobs` },
    books: { label: "Sách", href: `${BASE}/books` },
    library: { label: "Thư viện", href: `${BASE}/library` },
    styles: { label: "Phong cách", href: `${BASE}/styles` },
    system: { label: "Kênh bán & hệ thống", href: `${BASE}/system` },
  };
  const parent = top === "entity" ? ENTITY_PARENT[sub] : TOP_PARENT[top];
  return parent ? [parent, { label: title }] : [{ label: title }];
}
