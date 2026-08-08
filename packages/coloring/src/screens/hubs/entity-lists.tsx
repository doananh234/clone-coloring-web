"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityListScreen, type EntityCard } from "./entity-list-screen";
import { Button } from "../../components/ui/button";
import { Icon } from "../../lib/icon";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useRegenerateMissing } from "../../data/use-more-actions";
import { resolveImg } from "../../data/img";
import type { EntityListItem } from "../../data/types";
import type { BadgeTone } from "../../components/ui/badge";

/** "Tạo từ ảnh" button routing to the extract-style screen. */
function ExtractLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <Button variant="outline" size="sm" onClick={() => router.push(`${B}${href}`)}>
      <Icon name="wand" size={16} /> {label}
    </Button>
  );
}

/** "Regen references thiếu" for characters/locations. */
function RegenMissingButton({ type }: { type: "character" | "location" }) {
  const svc = useRegenerateMissing();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Button variant="outline" size="sm" disabled={!svc.enabled || busy} title={svc.enabled ? (err ?? undefined) : "Cần bật ghi thật (staging)"}
      onClick={async () => { setBusy(true); setErr(null); try { await svc.run(type); } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); } finally { setBusy(false); } }}>
      <Icon name="sparkles" size={16} /> {busy ? "Đang tạo…" : "Regen ảnh thiếu"}
    </Button>
  );
}

function trunc(s?: string | null, n = 48): string | undefined {
  if (!s) return undefined;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
function tagBadges(r: EntityListItem): { tone: BadgeTone; text: string }[] {
  return (r.tags ?? []).slice(0, 3).map((t) => ({ tone: "neutral" as const, text: t }));
}
function extractMeta(r: EntityListItem): string | undefined {
  const rec = r as unknown as { sourceBookId?: string | null };
  return rec.sourceBookId ? `Extract từ nguồn ${String(rec.sourceBookId).slice(0, 8)}` : undefined;
}

const characterCard = (r: EntityListItem): EntityCard => ({
  id: r.id,
  image: resolveImg(r.referenceImageUrl || r.referenceImages?.[0]),
  name: r.name,
  desc: r.role || r.type || undefined,
  meta: extractMeta(r),
  badges: tagBadges(r),
});
const locationCard = (r: EntityListItem): EntityCard => ({
  id: r.id,
  image: resolveImg(r.referenceImageUrl || r.referenceImages?.[0]),
  name: r.name,
  desc: trunc(r.description),
  meta: extractMeta(r),
  badges: tagBadges(r),
});
const brandCard = (r: EntityListItem): EntityCard => ({
  id: r.id,
  image: resolveImg(r.logoUrl),
  name: r.displayName || r.name,
  desc: trunc(r.description),
  round: false,
  badges: [r.isPublic ? { tone: "success", text: "Công khai" } : { tone: "neutral", text: "Riêng tư" }],
});
const categoryCard = (r: EntityListItem): EntityCard => ({
  id: r.id,
  image: resolveImg(r.thumbnailUrl),
  name: r.name,
  desc: trunc(r.description),
  round: false,
});
const styleCard = (r: EntityListItem): EntityCard => ({
  id: r.id,
  image: resolveImg(r.thumbnailUrl || r.referenceImages?.[0]),
  name: r.name,
  desc: trunc(r.description),
  round: false,
  badges: tagBadges(r),
});

/** Distinct primary colors across a coloring style's variants (capped). */
function variantSwatches(r: EntityListItem): string[] {
  const vs = (r as unknown as { variants?: unknown }).variants;
  if (!Array.isArray(vs)) return [];
  const colors: string[] = [];
  for (const v of vs) {
    const primary = (v as { colorPalette?: { primaryColors?: string[] } })?.colorPalette?.primaryColors ?? [];
    for (const c of primary) {
      if (typeof c === "string" && c && !colors.includes(c)) colors.push(c);
      if (colors.length >= 8) return colors;
    }
  }
  return colors;
}

/** Coloring-style card: adds palette swatches + a "N màu" variant-count badge. */
const colorStyleCard = (r: EntityListItem): EntityCard => {
  const vs = (r as unknown as { variants?: unknown[] }).variants;
  const count = Array.isArray(vs) ? vs.length : 0;
  return {
    ...styleCard(r),
    swatches: variantSwatches(r),
    badges: [
      ...tagBadges(r),
      ...(count > 1 ? [{ tone: "info" as const, text: `${count} màu` }] : []),
    ],
  };
};

export const CharactersScreen = () => (
  <EntityListScreen title="Nhân vật" subtitle="extract từ clone job" path="characters" kind="characters" toCard={characterCard} emptyText="Chưa có nhân vật nào." action={<RegenMissingButton type="character" />} />
);
export const LocationsScreen = () => (
  <EntityListScreen title="Bối cảnh" subtitle="location context" path="locations" kind="locations" toCard={locationCard} emptyText="Chưa có bối cảnh nào." action={<RegenMissingButton type="location" />} />
);
function CreateLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return <Button size="sm" onClick={() => router.push(`${B}${href}`)}><Icon name="plus" size={16} /> {label}</Button>;
}
export const BrandsScreen = () => (
  <EntityListScreen title="Brand" subtitle="brand xuất bản" path="brands" kind="brands" toCard={brandCard} emptyText="Chưa có brand nào." action={<CreateLink href="/library/brands/new" label="Tạo brand" />} />
);
export const CategoriesListScreen = () => (
  <EntityListScreen title="Danh mục" subtitle="map Etsy taxonomy" path="categories" kind="categories" toCard={categoryCard} emptyText="Chưa có danh mục nào." action={<CreateLink href="/library/categories/new" label="Tạo danh mục" />} />
);
export const BwStylesScreen = () => (
  <EntityListScreen title="B&W style" subtitle="style nét line-art" path="art-styles" kind="art-styles" toCard={styleCard} emptyText="Chưa có B&W style nào." action={<ExtractLink href="/styles/extractbw" label="Tạo từ ảnh" />} />
);
export const ColorStylesScreen = () => (
  <EntityListScreen title="Coloring style" subtitle="bảng màu & chất liệu" path="coloring-styles" kind="coloring-styles" toCard={colorStyleCard} largeImage selectable emptyText="Chưa có coloring style nào." action={<ExtractLink href="/styles/extractcolor" label="Tạo từ ảnh" />} />
);
