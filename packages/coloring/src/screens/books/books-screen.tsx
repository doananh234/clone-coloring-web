"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/form-controls";
import { Pagination } from "../../components/ui/pagination";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useBooks } from "../../data/use-books";
import { applyBookPatch } from "../../data/local-books";
import { resolveImg } from "../../data/img";
import type { BookRow } from "../../data/types";

function BookCard({ book, onOpen }: { book: BookRow; onOpen: () => void }) {
  const cover = resolveImg(book.squareThumbnailUrl || book.thumbnailUrl || book.coverUrl);
  const pages = book.specifications?.pages;
  const meta = [book.category, pages ? `${pages} trang` : null, book.price].filter(Boolean).join(" · ");
  return (
    <div className="mo-bookcard" onClick={onOpen}>
      <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", background: "var(--neutral-100)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={book.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Icon name="image" size={24} />
        )}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.title}</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta || "—"}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {book.isPublic ? <Badge tone="success" dot>Đang bán</Badge> : <Badge tone="neutral">Nháp</Badge>}
        {book.category && <Badge tone="neutral">{book.category}</Badge>}
      </div>
    </div>
  );
}

export function BooksScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("all");
  const { books, total, totalPages, isLoading, isError } = useBooks(page, 24);

  const patched = useMemo(() => books.map(applyBookPatch), [books]);
  const catOptions = useMemo(() => {
    const set = new Set<string>();
    patched.forEach((b) => b.category && set.add(b.category));
    return [{ label: "Tất cả danh mục", value: "" }, ...[...set].map((c) => ({ label: c, value: c }))];
  }, [patched]);

  const ql = q.trim().toLowerCase();
  const shown = patched.filter(
    (b) =>
      (!ql || b.title.toLowerCase().includes(ql)) &&
      (!cat || b.category === cat) &&
      (status === "all" || (status === "pub" ? b.isPublic : !b.isPublic)),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Sách</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>{isLoading ? "Đang tải thư viện…" : `${total} sách trong thư viện`}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 220 }}><Input icon="search" placeholder="Tìm tên sách…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ width: 170 }}><Select value={cat} onChange={setCat} options={catOptions} /></div>
          <div style={{ width: 150 }}><Select value={status} onChange={setStatus} options={[{ label: "Tất cả", value: "all" }, { label: "Đang bán", value: "pub" }, { label: "Nháp", value: "draft" }]} /></div>
          <Button size="sm" onClick={() => router.push(`${B}/books/new`)}><Icon name="plus" size={16} /> Tạo sách</Button>
        </div>
      </div>

      {isLoading ? (
        <Card><LoadingRows rows={4} height={120} /></Card>
      ) : isError ? (
        <Card><ErrorState sub="Không gọi được /api/books." /></Card>
      ) : books.length === 0 ? (
        <Card><EmptyState icon="book-open" title="Thư viện trống" sub="Sách sẽ xuất hiện sau khi clone job hoàn tất." /></Card>
      ) : shown.length === 0 ? (
        <Card><EmptyState icon="book-open" title="Không khớp" sub="Không có sách nào khớp bộ lọc trong trang này." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
          {shown.map((b) => <BookCard key={b.id} book={b} onOpen={() => router.push(`${B}/books/${b.id}`)} />)}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} />
    </div>
  );
}
