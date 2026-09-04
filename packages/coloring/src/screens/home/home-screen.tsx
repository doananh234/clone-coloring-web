"use client";

import { useEffect, useState } from "react";
import { httpGet } from "@vx/core-uikit/api";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { LoadingRows, EmptyState } from "../../components/ui/states";
import { COLORING_API_BASE } from "../../data/config";
import { resolveImg } from "../../data/img";
import { useAppHome, type AppHome } from "../../data/use-app-home";
import { useBooks } from "../../data/use-books";
import type { BookRow } from "../../data/types";

type Msg = { err?: string; ok?: string } | null;

/** Thumbnail tile with a remove button — shared by all three collections. */
function Tile({ img, title, sub, onRemove }: { img?: string; title: string; sub?: string; onRemove: () => void }) {
  return (
    <div style={{ position: "relative", width: 128 }}>
      <div style={{ aspectRatio: "3/4", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--neutral-100)", border: "1px solid var(--border)" }}>
        {img ? <img src={img} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      </div>
      <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.3, maxHeight: 32, overflow: "hidden" }}>{title}</div>
      {sub ? <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{sub}</div> : null}
      <button onClick={onRemove} title="Bỏ khỏi collection"
        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", border: "none", background: "var(--danger)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: Parameters<typeof Icon>[0]["name"]; count: number; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={18} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        <Badge tone="neutral">{count}</Badge>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>
    </Card>
  );
}

export function HomeScreen() {
  const { home, isLoading, writeEnabled, save, autoConfig, publish } = useAppHome();
  const [draft, setDraft] = useState<AppHome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState("");
  const { books, isLoading: booksLoading } = useBooks(1, 12, { q });

  // Load the server doc into the editable draft (once per fetch).
  useEffect(() => { if (!isLoading) setDraft(home); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isLoading, home]);

  if (isLoading || !draft) return <Card><LoadingRows rows={6} /></Card>;

  const set = (patch: Partial<AppHome>) => setDraft((d) => ({ ...(d as AppHome), ...patch }));
  const inNA = (id: string) => draft.newArrivalBooks.some((x) => x.id === id);
  const inTR = (id: string) => draft.trendingBooks.some((x) => x.id === id);
  const inFree = (id: string) => draft.freeColoringPages.some((x) => x.bookId === id);

  const addNewArrival = (b: BookRow) => {
    if (inNA(b.id)) return;
    set({ newArrivalBooks: [...draft.newArrivalBooks, { id: b.id, title: b.title, coverUrl: b.coverUrl || "", subtitle: b.subtitle || undefined, price: b.price || undefined, backgroundColor: b.backgroundColor || undefined, order: draft.newArrivalBooks.length }] });
  };
  const addTrending = (b: BookRow) => {
    if (inTR(b.id)) return;
    set({ trendingBooks: [...draft.trendingBooks, { id: b.id, rank: draft.trendingBooks.length + 1, title: b.title, subtitle: b.subtitle || "", imageUrl: b.coverUrl || "", participantCount: String(b.specifications?.pages ?? "") }] });
  };
  const addFree = async (b: BookRow) => {
    if (inFree(b.id)) return;
    setBusy("free-" + b.id); setMsg(null);
    try {
      const detail = await httpGet<{ coloringPages?: { id: string; url: string }[]; backgroundColor?: string; category?: string }>(`${COLORING_API_BASE}/books/${encodeURIComponent(b.id)}`);
      const p = (detail.coloringPages ?? []).find((x) => x.url);
      if (!p) { setMsg({ err: `"${b.title}" chưa có trang interior để làm free` }); return; }
      set({ freeColoringPages: [...draft.freeColoringPages, { id: p.id, bookId: b.id, bookTitle: b.title, series: detail.category || b.category || "", imageUrl: p.url, backgroundColor: detail.backgroundColor || "" }] });
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : "Không thêm được free page" }); }
    finally { setBusy(null); }
  };

  const removeNA = (id: string) => set({ newArrivalBooks: draft.newArrivalBooks.filter((x) => x.id !== id).map((x, i) => ({ ...x, order: i })) });
  const removeTR = (id: string) => set({ trendingBooks: draft.trendingBooks.filter((x) => x.id !== id).map((x, i) => ({ ...x, rank: i + 1 })) });
  const removeFree = (id: string) => set({ freeColoringPages: draft.freeColoringPages.filter((x) => x.id !== id) });

  const run = (key: string, fn: () => Promise<unknown>, okMsg?: string) => async () => {
    setBusy(key); setMsg(null);
    try { await fn(); if (okMsg) setMsg({ ok: okMsg }); }
    catch (e) { setMsg({ err: e instanceof Error ? e.message : "Thao tác thất bại" }); }
    finally { setBusy(null); }
  };

  const doAuto = run("auto", async () => {
    const synced = await autoConfig();
    setMsg({ ok: synced ? `Auto config: ${synced.newArrivalBooks} mới, ${synced.trendingBooks} trending, ${synced.freeColoringPages} free` : "Đã auto config" });
  });
  const doSave = run("save", () => save(draft), "Đã lưu collections (local). Bấm Publish để đẩy lên Firebase.");
  const doPublish = run("publish", async () => {
    const r = await publish();
    setMsg({ ok: `Đã publish lên Firebase (${r?.projectId ?? "prod"})` });
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary" size="sm" disabled={!writeEnabled || busy !== null} onClick={doAuto}>
          <Icon name="wand" size={16} /> {busy === "auto" ? "Đang auto…" : "Auto config"}
        </Button>
        <Button variant="outline" size="sm" disabled={!writeEnabled || busy !== null} onClick={doSave}>
          <Icon name="download" size={16} /> {busy === "save" ? "Đang lưu…" : "Lưu collections"}
        </Button>
        <Button variant="outline" size="sm" disabled={!writeEnabled || busy !== null} onClick={doPublish}
          title="Đẩy app/home lên Firestore prod (đúng schema, merge an toàn)">
          <Icon name="upload" size={16} /> {busy === "publish" ? "Đang publish…" : "Publish → Firebase"}
        </Button>
        <span style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>
          Auto config tự dựng từ sách hiện có · chỉnh tay bên dưới · Lưu rồi Publish.
        </span>
      </div>
      {msg?.err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{msg.err}</div>}
      {msg?.ok && <div style={{ color: "var(--success)", fontSize: 13 }}>{msg.ok}</div>}

      <Section title="New Arrival" icon="sparkles" count={draft.newArrivalBooks.length}>
        {draft.newArrivalBooks.length === 0 ? <EmptyState title="Chưa có sách" /> :
          draft.newArrivalBooks.map((x) => <Tile key={x.id} img={resolveImg(x.coverUrl)} title={x.title} sub={x.price || undefined} onRemove={() => removeNA(x.id)} />)}
      </Section>

      <Section title="Trending" icon="tag" count={draft.trendingBooks.length}>
        {draft.trendingBooks.length === 0 ? <EmptyState title="Chưa có sách" /> :
          draft.trendingBooks.map((x) => <Tile key={x.id} img={resolveImg(x.imageUrl)} title={`#${x.rank} ${x.title}`} sub={x.participantCount ? `${x.participantCount} trang` : undefined} onRemove={() => removeTR(x.id)} />)}
      </Section>

      <Section title="Free Coloring Pages" icon="eye" count={draft.freeColoringPages.length}>
        {draft.freeColoringPages.length === 0 ? <EmptyState title="Chưa có trang free" /> :
          draft.freeColoringPages.map((x) => <Tile key={x.id} img={resolveImg(x.imageUrl)} title={x.bookTitle} sub={x.series || undefined} onRemove={() => removeFree(x.id)} />)}
      </Section>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Icon name="book-open" size={18} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Thêm sách vào collection</h3>
        </div>
        <Input placeholder="Tìm sách theo tên…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, maxWidth: 360 }} />
        {booksLoading ? <LoadingRows rows={3} /> : books.length === 0 ? <EmptyState title="Không có sách" /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {books.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                <div style={{ width: 36, height: 48, borderRadius: 6, overflow: "hidden", background: "var(--neutral-100)", flexShrink: 0 }}>
                  {b.coverUrl ? <img src={resolveImg(b.coverUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{b.category || "—"}</div>
                </div>
                <Button variant={inNA(b.id) ? "primary" : "outline"} size="sm" disabled={!writeEnabled || inNA(b.id)} onClick={() => addNewArrival(b)}>New Arrival</Button>
                <Button variant={inTR(b.id) ? "primary" : "outline"} size="sm" disabled={!writeEnabled || inTR(b.id)} onClick={() => addTrending(b)}>Trending</Button>
                <Button variant={inFree(b.id) ? "primary" : "outline"} size="sm" disabled={!writeEnabled || inFree(b.id) || busy === "free-" + b.id} onClick={() => addFree(b)}>Free</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
