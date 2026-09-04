"use client";

import { type ReactNode } from "react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import type { BookDetail, BookColoringPage, BookEtsyListing, BookSpecifications } from "../../data/types";

const mono = { fontFamily: "var(--font-mono)" as const };

function Row({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: last ? undefined : "1px solid var(--border)", fontSize: 13.5 }}>
      <span style={{ color: "var(--muted-foreground)", flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0, wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

const dash = <span style={{ color: "var(--muted-foreground)" }}>—</span>;
const val = (v: unknown): ReactNode => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s ? s : dash;
};
const code = (v: unknown): ReactNode => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? <span style={{ ...mono, fontSize: 12 }}>{s}</span> : dash;
};
const bool = (v: unknown): ReactNode =>
  v ? <Badge tone="success">Có</Badge> : <Badge tone="neutral">Không</Badge>;
function swatch(v: unknown): ReactNode {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return dash;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, border: "1px solid var(--border)", background: s, flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: 12 }}>{s}</span>
    </span>
  );
}
function fmtDate(v: unknown): ReactNode {
  if (typeof v !== "string" || !v) return dash;
  try {
    return new Date(v).toLocaleString("vi-VN");
  } catch {
    return v;
  }
}

/**
 * "Thông tin" tab — full read-only metadata of a book, grouped into sections.
 * Pulls both top-level columns and nested `data` (specifications, etsyListing,
 * tags, colors, flags…) so everything editable in the form is also visible here.
 */
export function BookInformationTab({ b, pages }: { b: BookDetail; pages: BookColoringPage[] }) {
  const data = (b.data ?? {}) as Record<string, unknown>;
  const coverMeta = (data.coverMeta ?? {}) as Record<string, unknown>;
  const specs = (b.specifications ?? (data.specifications as BookSpecifications | undefined) ?? {}) as BookSpecifications;
  const etsy = ((data.etsyListing as BookEtsyListing | undefined) ?? {}) as BookEtsyListing;
  const tags = (b.tags ?? (data.tags as string[] | undefined) ?? []) as string[];
  const niche = b.niche || (data.niche as string | undefined);
  const str = (k: string) => data[k] as string | undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Cơ bản">
        <Row label="Tiêu đề">{val(b.title)}</Row>
        <Row label="Phụ đề">{val(b.subtitle)}</Row>
        <Row label="Danh mục">{val(b.category)}</Row>
        <Row label="Category ID">{code(b.categoryId)}</Row>
        <Row label="Niche">{niche ? <Badge tone="info">{niche}</Badge> : dash}</Row>
        <Row label="Badge">{val(b.badge)}</Row>
        <Row label="Trạng thái" last>
          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {b.isPublic ? <Badge tone="success" dot>Đã duyệt</Badge> : <Badge tone="neutral">Nháp</Badge>}
            {b.isPremium && <Badge tone="carbon">Premium</Badge>}
          </span>
        </Row>
      </Card>

      {b.description && (
        <Card title="Mô tả"><div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{b.description}</div></Card>
      )}

      <Card title="Giá">
        <Row label="Giá bán"><span style={{ ...mono, fontWeight: 600 }}>{val(b.price)}</span></Row>
        <Row label="Giá gốc">{code(b.originalPrice)}</Row>
        <Row label="Giảm giá" last>{val(b.discount)}</Row>
      </Card>

      <Card title="Thông số">
        <Row label="Số trang"><span style={mono}>{specs?.pages ?? pages.length}</span></Row>
        <Row label="Kích thước">{val(specs?.dimensions)}</Row>
        <Row label="Độ tuổi" last={!tags.length}>{val(specs?.ageRange)}</Row>
        {tags.length > 0 && (
          <div style={{ padding: "10px 0 0" }}>
            <div style={{ color: "var(--muted-foreground)", marginBottom: 8, fontSize: 13.5 }}>Keywords</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{tags.map((t, i) => <Badge tone="neutral" key={i}>{t}</Badge>)}</div>
          </div>
        )}
      </Card>

      <Card title="Khám phá & giao diện">
        <Row label="Theme style">{val(str("themeStyle"))}</Row>
        <Row label="Holiday">{val(str("holiday"))}</Row>
        <Row label="Occasion">{val(str("occasion"))}</Row>
        <Row label="Màu nền">{swatch(b.backgroundColor)}</Row>
        <Row label="Màu chính">{swatch(str("primaryColor"))}</Row>
        <Row label="Màu phụ" last>{swatch(str("secondaryColor"))}</Row>
      </Card>

      <Card title="Cờ trạng thái">
        <Row label="Premium">{bool(b.isPremium)}</Row>
        <Row label="Đã convert">{bool(data.isConverted)}</Row>
        <Row label="Đã redesign">{bool(data.isRedesigned)}</Row>
        <Row label="Đã convert edition" last>{bool(data.isEditionConverted)}</Row>
      </Card>

      <Card title="Ảnh & file">
        <Row label="Cover URL">{code(b.coverUrl)}</Row>
        <Row label="Thumbnail 3:4">{code(b.thumbnailUrl)}</Row>
        <Row label="Thumbnail 1:1">{code(b.squareThumbnailUrl)}</Row>
        <Row label="PDF">{code(b.pdfUrl)}</Row>
        <Row label="Trang dùng thử" last>{code(b.tryoutPage)}</Row>
      </Card>

      <Card title="Etsy">
        <Row label="Etsy title">{val(etsy.etsyTitle)}</Row>
        <Row label="Etsy category">{val(etsy.etsyCategory)}</Row>
        <Row label="Subcategory">{val(etsy.subcategory)}</Row>
        <Row label="Section">{val(etsy.section)}</Row>
        <Row label="Giá gợi ý (USD)">{etsy.priceSuggestionUsd != null ? <span style={mono}>{etsy.priceSuggestionUsd}</span> : dash}</Row>
        <Row label="Ghi chú giá">{val(etsy.priceNotes)}</Row>
        <Row label="Materials" last={!etsy.etsyDescription}>{etsy.materials?.length ? etsy.materials.join(", ") : dash}</Row>
        {etsy.etsyDescription && (
          <div style={{ padding: "10px 0 0" }}>
            <div style={{ color: "var(--muted-foreground)", marginBottom: 6, fontSize: 13.5 }}>Etsy description</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{etsy.etsyDescription}</div>
          </div>
        )}
      </Card>

      <Card title="Liên kết & ID">
        <Row label="Book ID">{code(b.id)}</Row>
        <Row label="Clone job ID">{code(data.cloneJobId)}</Row>
        <Row label="Source book ID">{code(data.sourceBookId)}</Row>
        <Row label="Art style ID">{code(data.artStyleId)}</Row>
        <Row label="Coloring style ID">{code(coverMeta.coloringStyleId ?? data.coloringStyleId)}</Row>
        <Row label="Coloring variant ID" last>{code(coverMeta.coloringVariantId ?? data.coloringVariantId)}</Row>
      </Card>

      <Card title="Thời gian">
        <Row label="Tạo">{fmtDate(b.createdAt)}</Row>
        <Row label="Cập nhật" last>{fmtDate(b.updatedAt)}</Row>
      </Card>
    </div>
  );
}
