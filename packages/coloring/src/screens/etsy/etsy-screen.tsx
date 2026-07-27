"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs } from "../../components/ui/tabs";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useBooks } from "../../data/use-books";
import { resolveImg } from "../../data/img";
import type { BookRow } from "../../data/types";

type Tab = "all" | "live" | "hidden";

const th = {
  textAlign: "left" as const,
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "var(--tracking-caps)",
  color: "var(--muted-foreground)",
  borderBottom: "1px solid var(--border)",
};
const td = { padding: 12, borderBottom: "1px solid var(--border)" };
const mono = { fontFamily: "var(--font-mono)" };

export function EtsyScreen() {
  const router = useRouter();
  // Books carry full coloringPages arrays (heavy ~10MB/60), so keep the page modest.
  const { books, isLoading, isError } = useBooks(1, 60);
  const [tab, setTab] = useState<Tab>("all");

  const listed = books.filter((b) => b.etsyListing);
  const rows =
    tab === "all" ? listed : tab === "live" ? listed.filter((b) => b.isPublic) : listed.filter((b) => !b.isPublic);

  const tabs = [
    { key: "all" as Tab, label: "Tất cả", count: listed.length },
    { key: "live" as Tab, label: "Đang bán", count: listed.filter((b) => b.isPublic).length },
    { key: "hidden" as Tab, label: "Tạm ẩn", count: listed.filter((b) => !b.isPublic).length },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Etsy listings</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>Sách đã có nội dung listing cho Etsy</p>
      </div>

      {!isLoading && !isError && listed.length > 0 && <Tabs<Tab> items={tabs} value={tab} onChange={setTab} />}

      <Card>
        {isLoading ? (
          <LoadingRows rows={6} />
        ) : isError ? (
          <ErrorState sub="Không gọi được /books." />
        ) : rows.length === 0 ? (
          <EmptyState icon="store" title="Chưa có listing" sub="Chưa có sách nào được tạo nội dung Etsy." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Sách</th>
                  <th style={th}>Tiêu đề Etsy</th>
                  <th style={{ ...th, textAlign: "right" }}>Giá đề xuất</th>
                  <th style={th}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b: BookRow) => {
                  const cover = resolveImg(b.coverUrl || b.squareThumbnailUrl || b.thumbnailUrl);
                  const price = b.etsyListing?.priceSuggestionUsd;
                  return (
                    <tr key={b.id} className="mo-row" style={{ cursor: "pointer" }} onClick={() => router.push(`${B}/books/${b.id}`)}>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <span style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden", background: "var(--neutral-100)", border: "1px solid var(--border)", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
                            {cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cover} alt={b.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <Icon name="image" size={14} />
                            )}
                          </span>
                          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                        </div>
                      </td>
                      <td style={{ ...td, maxWidth: 320 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>
                          {b.etsyListing?.etsyTitle || "—"}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", ...mono }}>{price != null ? `$${price}` : "—"}</td>
                      <td style={td}>
                        {b.isPublic ? <Badge tone="success" dot>Đang bán</Badge> : <Badge tone="neutral">Tạm ẩn</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
