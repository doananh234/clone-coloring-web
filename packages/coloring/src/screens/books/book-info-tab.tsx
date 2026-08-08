"use client";

import { type ReactNode } from "react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import type { BookDetail, BookColoringPage } from "../../data/types";

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
 * Pulls both top-level columns and nested `data`/`coverMeta`/`specifications`.
 */
export function BookInformationTab({ b, pages }: { b: BookDetail; pages: BookColoringPage[] }) {
  const data = (b.data ?? {}) as Record<string, unknown>;
  const coverMeta = (data.coverMeta ?? {}) as Record<string, unknown>;
  const specs = b.specifications;
  const niche = b.niche || (data.niche as string | undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Cơ bản">
        <Row label="Tiêu đề">{val(b.title)}</Row>
        <Row label="Phụ đề">{val(b.subtitle)}</Row>
        <Row label="Danh mục">{val(b.category)}</Row>
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
        <Row label="Độ tuổi" last={!b.tags?.length}>{val(specs?.ageRange)}</Row>
        {b.tags && b.tags.length > 0 && (
          <div style={{ padding: "10px 0 0" }}>
            <div style={{ color: "var(--muted-foreground)", marginBottom: 8, fontSize: 13.5 }}>Keywords</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{b.tags.map((t, i) => <Badge tone="neutral" key={i}>{t}</Badge>)}</div>
          </div>
        )}
      </Card>

      <Card title="Etsy">
        <Row label="Etsy title">{val(b.etsyListing?.etsyTitle)}</Row>
        <Row label="PDF" last>{b.pdfUrl ? code(b.pdfUrl) : dash}</Row>
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
