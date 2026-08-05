"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryParam, useQueryNumber, useSetQueryParams } from "../../hooks/use-query-param";
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
import { useOperators, useBookAssign } from "../../data/use-book-assign";
import { useColoringAuth } from "../../hooks/coloring-auth";
import { applyBookPatch } from "../../data/local-books";
import { resolveImg } from "../../data/img";
import type { BookRow } from "../../data/types";

/** Delay before a search keystroke triggers an API fetch. */
const SEARCH_DEBOUNCE_MS = 350;

function BookCard({ book, onOpen, checked, onToggle, assigneeName }: { book: BookRow; onOpen: () => void; checked: boolean; onToggle: () => void; assigneeName?: string }) {
  // Show the actual cover (branded, with title) — fall back to the clean thumbnail.
  const cover = resolveImg(book.coverUrl || book.squareThumbnailUrl || book.thumbnailUrl);
  const pages = book.specifications?.pages;
  const meta = [book.category, pages ? `${pages} trang` : null, book.price].filter(Boolean).join(" · ");
  return (
    <div className="mo-bookcard" onClick={onOpen} style={{ position: "relative", ...(checked ? { outline: "2px solid var(--volt-600)", outlineOffset: 2 } : {}) }}>
      <label onClick={(e) => e.stopPropagation()} title="Chọn để giao" style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,.92)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{ cursor: "pointer", width: 15, height: 15 }} />
      </label>
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
        {book.niche && <Badge tone="info">{book.niche}</Badge>}
        {book.category && <Badge tone="neutral">{book.category}</Badge>}
        {assigneeName && <Badge tone="carbon">◍ {assigneeName}</Badge>}
      </div>
    </div>
  );
}

export function BooksScreen() {
  const router = useRouter();
  // URL-backed state so pagination/search/filters survive reload + are shareable.
  const [page, setPage] = useQueryNumber("page", 1);
  const [q] = useQueryParam("q", "");
  const [cat] = useQueryParam("cat", "");
  const [status] = useQueryParam("status", "all");
  const [assignFilter] = useQueryParam("assign", "all");
  const setParams = useSetQueryParams();
  // Changing any filter resets to page 1 (else you land on an out-of-range/empty page).
  const setQ = (v: string) => setParams({ q: v || null, page: null });
  const setCat = (v: string) => setParams({ cat: v || null, page: null });
  const setStatus = (v: string) => setParams({ status: v === "all" ? null : v, page: null });
  const setAssignFilter = (v: string) => setParams({ assign: v === "all" ? null : v, page: null });

  // Debounced search: the input updates instantly for a responsive feel, but the
  // URL param `q` (which drives the API fetch) is only written after typing
  // pauses — so we don't fire a request + refetch on every keystroke.
  const [searchText, setSearchText] = useState(q);
  const setQRef = useRef(setQ);
  setQRef.current = setQ;
  // Sync the box when `q` changes from outside (back/forward nav, reset).
  useEffect(() => setSearchText(q), [q]);
  useEffect(() => {
    if (searchText === q) return;
    const t = setTimeout(() => setQRef.current(searchText), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText, q]);
  // Search/category/status all filter server-side (full library, every page) —
  // not client-side on the current page (the old "search only in this page" bug).
  const { books, total, totalPages, isLoading, isError } = useBooks(page, 24, { q, cat, status, assign: assignFilter });

  const shown = useMemo(() => books.map(applyBookPatch), [books]);
  const catOptions = useMemo(() => {
    const set = new Set<string>();
    shown.forEach((b) => b.category && set.add(b.category));
    if (cat) set.add(cat);
    return [{ label: "Tất cả danh mục", value: "" }, ...[...set].map((c) => ({ label: c, value: c }))];
  }, [shown, cat]);

  // Assignment: any operator can select books; members claim to themselves,
  // admins can assign to any operator (or unassign). Assigned books drop out of
  // other members' lists (server-side filter) but stay visible to admins.
  const { user } = useColoringAuth();
  const isAdmin = user?.role === "admin";
  const operators = useOperators(isAdmin);
  const { assign } = useBookAssign();
  const opName = useMemo(() => new Map(operators.map((o) => [o.id, o.name || o.username])), [operators]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const toggle = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => { setSelected(new Set()); setAssignTo(""); setAssignErr(null); };
  const doAssign = async (assigneeId: string | null) => {
    if (selected.size === 0) return;
    setAssignBusy(true); setAssignErr(null);
    try { await assign([...selected], assigneeId); clearSel(); }
    catch (e) { setAssignErr(e instanceof Error ? e.message : "Giao sách thất bại"); }
    finally { setAssignBusy(false); }
  };
  const assigneeLabel = (b: BookRow): string | undefined =>
    !b.assignedToId ? undefined : opName.get(b.assignedToId) || (isAdmin ? b.assignedToId.slice(0, 6) : "Của tôi");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Sách</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>{isLoading ? "Đang tải thư viện…" : `${total} sách trong thư viện`}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 220 }}><Input icon="search" placeholder="Tìm tên, niche…" value={searchText} onChange={(e) => setSearchText(e.target.value)} /></div>
          <div style={{ width: 170 }}><Select value={cat} onChange={setCat} options={catOptions} /></div>
          <div style={{ width: 150 }}><Select value={status} onChange={setStatus} options={[{ label: "Tất cả", value: "all" }, { label: "Đang bán", value: "pub" }, { label: "Nháp", value: "draft" }]} /></div>
          <div style={{ width: 150 }}><Select value={assignFilter} onChange={setAssignFilter} options={[{ label: "Tất cả", value: "all" }, { label: "Của tôi", value: "mine" }, { label: "Chưa giao", value: "unassigned" }]} /></div>
          <Button size="sm" onClick={() => router.push(`${B}/books/new`)}><Icon name="plus" size={16} /> Tạo sách</Button>
        </div>
      </div>

      {selected.size > 0 && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Đã chọn {selected.size} sách</span>
            <div style={{ flex: 1 }} />
            {isAdmin ? (
              <>
                <div style={{ width: 210 }}>
                  <Select value={assignTo} onChange={setAssignTo} options={[{ label: "— Chọn người nhận —", value: "" }, ...operators.map((o) => ({ label: `${o.name || o.username}${o.role === "admin" ? " (admin)" : ""}`, value: o.id }))]} />
                </div>
                <Button size="sm" disabled={assignBusy || !assignTo} onClick={() => doAssign(assignTo)}>{assignBusy ? "Đang giao…" : "Giao"}</Button>
                <Button variant="outline" size="sm" disabled={assignBusy} onClick={() => doAssign(null)}>Bỏ giao</Button>
              </>
            ) : (
              <Button size="sm" disabled={assignBusy} onClick={() => doAssign(null)}>{assignBusy ? "Đang nhận…" : "Nhận về tôi"}</Button>
            )}
            <Button variant="ghost" size="sm" disabled={assignBusy} onClick={clearSel}>Bỏ chọn</Button>
          </div>
          {assignErr && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>{assignErr}</div>}
        </Card>
      )}

      {isLoading ? (
        <Card><LoadingRows rows={4} height={120} /></Card>
      ) : isError ? (
        <Card><ErrorState sub="Không gọi được /api/books." /></Card>
      ) : shown.length === 0 ? (
        q || cat || status !== "all" || assignFilter !== "all" ? (
          <Card><EmptyState icon="book-open" title="Không khớp" sub="Không có sách nào khớp tìm kiếm/bộ lọc." /></Card>
        ) : (
          <Card><EmptyState icon="book-open" title="Thư viện trống" sub="Sách sẽ xuất hiện sau khi clone job hoàn tất." /></Card>
        )
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
          {shown.map((b) => <BookCard key={b.id} book={b} onOpen={() => router.push(`${B}/books/${b.id}`)} checked={selected.has(b.id)} onToggle={() => toggle(b.id)} assigneeName={assigneeLabel(b)} />)}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPrev={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(totalPages, page + 1))} />
    </div>
  );
}
