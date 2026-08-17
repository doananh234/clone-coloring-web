"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Tabs } from "../../components/ui/tabs";
import { PreviewModal, type PreviewModalProps } from "../../components/ui/preview-modal";
import { ImageComparison } from "../../components/ui/image-comparison";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useBook } from "../../data/use-book";
import { useBookJob } from "../../data/use-book-job";
import { getBookPatch } from "../../data/local-books";
import { useGeneratePdf, useGenerateSubtitle, useReclone, useDeleteBook, useApproveBook } from "../../data/use-book-actions";
import { PageActionsRow } from "./page-actions-row";
import { CoverCandidatesStrip } from "./cover-candidates-strip";
import { BookInformationTab } from "./book-info-tab";
import { BookOriginalSection } from "./book-original-section";
import { PageBatchSelect } from "./page-batch-select";
import { resolveImg } from "../../data/img";
import { COLORING_WRITE_ENABLED, COLORING_API_BASE } from "../../data/config";
import { parsePageScene, hasSceneDetail, type ParsedScene } from "../../data/page-scene";
import type { BookDetail, BookColoringPage, CoverCandidate } from "../../data/types";
import { deriveBookPageLabel, bookPageTone, type BookPageTone } from "../../data/book-page-label";
import { SourceCoverSection } from "./source-cover-section";
import type { SourceCover } from "../../data/source-covers";

const mono = { fontFamily: "var(--font-mono)" as const };
const cap = { fontSize: 11, fontWeight: 600 as const, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "var(--tracking-caps)" };

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={cap}>{label}</div>
      <div style={{ ...mono, fontWeight: 700, fontSize: 22, marginTop: 4, color: "var(--neutral-400)" }}>{value}</div>
    </div>
  );
}

function AttrRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: last ? undefined : "1px solid var(--border)", fontSize: 13.5 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0 }}>{children}</span>
    </div>
  );
}

function Thumb({ src, caption, badge, onClick }: { src?: string; caption: string; badge?: string; onClick?: () => void }) {
  return (
    <div style={{ cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div className="mo-bookthumb" style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: "var(--neutral-100)", border: "1px solid var(--border)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Icon name="image" size={20} />
        )}
        {badge && <span style={{ position: "absolute", left: 6, top: 6, background: "var(--volt-500)", color: "var(--carbon-950)", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>{badge}</span>}
      </div>
      <div style={{ fontSize: 12, marginTop: 6, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caption}</div>
    </div>
  );
}

const CAP = { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".04em", color: "var(--muted-foreground)", marginBottom: 4 };

const TONE_STYLE: Record<BookPageTone, { border: string; bg?: string; label: string }> = {
  cover:      { border: "var(--info)",    bg: "var(--info-bg)",    label: "Cover" },
  intro:      { border: "var(--volt-500)", bg: "var(--volt-200)",  label: "Intro" },
  interior:   { border: "var(--border)",                            label: "Interior" },
  additional: { border: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 14%, var(--neutral-100))", label: "Additional" },
  colored:    { border: "var(--success)", bg: "var(--success-bg)", label: "Colored" },
};

/** Rich per-page analyze block: scene, characters + prompts, locations + prompts, prompt. */
function AnalyzePanel({ scene }: { scene: ParsedScene }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {scene.sceneDesc && (
        <div><div style={CAP}>Cảnh</div><div style={{ fontSize: 13, lineHeight: 1.5 }}>{scene.sceneDesc}</div></div>
      )}
      {scene.characters.length > 0 && (
        <div>
          <div style={CAP}>Nhân vật · {scene.characters.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {scene.characters.map((c, i) => (
              <div key={i} style={{ borderLeft: "2px solid var(--volt-500)", paddingLeft: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}{c.role ? <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}> · {c.role}</span> : null}</div>
                {c.prompt && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.5, color: "var(--muted-foreground)", marginTop: 2 }}>{c.prompt}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {scene.locations.length > 0 && (
        <div>
          <div style={CAP}>Bối cảnh · {scene.locations.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {scene.locations.map((l, i) => (
              <div key={i} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</div>
                {(l.prompt || l.description) && <div style={{ fontFamily: l.prompt ? "var(--font-mono)" : undefined, fontSize: 11.5, lineHeight: 1.5, color: "var(--muted-foreground)", marginTop: 2 }}>{l.prompt || l.description}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {scene.reproductionPrompt && (
        <div><div style={CAP}>Reproduction prompt</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.5 }}>{scene.reproductionPrompt}</div></div>
      )}
    </div>
  );
}

function PageThumb({ page, displayNumber, tone, onClick }: { page: BookColoringPage; displayNumber: string; tone: BookPageTone; onClick?: () => void }) {
  const src = resolveImg(page.coloredUrl || page.url);
  const t = TONE_STYLE[tone];
  return (
    <div onClick={onClick} className="mo-bookthumb" style={{ cursor: onClick ? "pointer" : "default", aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: t.bg ?? "var(--neutral-100)", border: `1px solid ${t.border}`, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={displayNumber} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Icon name="image" size={18} />
      )}
      <span style={{ position: "absolute", left: 6, bottom: 4, ...mono, fontSize: 10, color: "#fff", background: "rgba(11,13,12,.6)", padding: "0 4px", borderRadius: 4 }}>{displayNumber}</span>
      {page.coloredUrl && <span style={{ position: "absolute", right: 5, top: 5, background: "var(--volt-500)", color: "var(--carbon-950)", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>MÀU</span>}
    </div>
  );
}

function PageSection({ tone, count, children, label }: { tone: BookPageTone; count: number; children: ReactNode; label?: string }) {
  const t = TONE_STYLE[tone];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: t.border }} />
        <span style={{ ...cap, fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{label ?? t.label}</span>
        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{count}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

export function BookDetailScreen({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { book, isLoading, isError } = useBook(bookId);
  const genPdf = useGeneratePdf(bookId);
  const genSubtitle = useGenerateSubtitle(bookId);
  const reclone = useReclone(bookId);
  const deleteBook = useDeleteBook(bookId);
  const approveBook = useApproveBook(bookId);
  const { jobId: relatedJobId } = useBookJob(bookId);
  const searchParams = useSearchParams();
  // Deep-link support: `?tab=pages` (e.g. from the generation queue drawer) opens
  // straight to that tab instead of the default "Tổng quan". Read once on mount.
  const initialTab = ((): "info" | "meta" | "pages" | "select" => {
    const t = searchParams?.get("tab");
    return t === "meta" || t === "pages" || t === "select" ? t : "info";
  })();
  const [tab, setTab] = useState<"info" | "meta" | "pages" | "select">(initialTab);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ err?: string; ok?: string } | null>(null);
  const [preview, setPreview] = useState<Omit<PreviewModalProps, "open" | "onClose"> | null>(null);
  const [previewPage, setPreviewPage] = useState<BookColoringPage | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const closePreview = () => { setPreview(null); setPreviewPage(null); setPreviewIdx(null); };

  const makePdf = async () => {
    setBusy(true); setMsg(null);
    try {
      const url = await genPdf();
      // Open the freshly generated PDF straight away (also stays available via "Tải PDF").
      const href = resolveImg(url);
      if (href) window.open(href, "_blank", "noopener");
      setMsg({ ok: "Đã tạo PDF" });
    }
    catch (e) { setMsg({ err: e instanceof Error ? e.message : "Thất bại" }); }
    finally { setBusy(false); }
  };

  if (isLoading) return <Card><LoadingRows rows={6} /></Card>;
  if (isError || !book) {
    return (
      <Card>
        <ErrorState sub={`Không tải được sách ${bookId}.`} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outline" size="sm" onClick={() => router.push(`${B}/books`)}>Về thư viện</Button>
        </div>
      </Card>
    );
  }

  const b: BookDetail = book;
  const cover = resolveImg(b.coverUrl || b.squareThumbnailUrl || b.thumbnailUrl);
  // coverMeta.sourceThumbnailUrl feeds the CoverCandidatesStrip "open in editor"
  // + BookOriginalSection fallback. (The old cover-versions thumbnail grid was
  // removed — the Info tab now shows only the Cover candidates.)
  const coverMetaObj = (b.data?.coverMeta ?? {}) as { sourceThumbnailUrl?: string };
  const pages = b.coloringPages ?? [];
  const cloneJobId = typeof b.data?.cloneJobId === "string" ? b.data.cloneJobId : undefined;
  const colored = pages.filter((p) => p.coloredUrl).length;
  // D4c cover candidates (each "Push to Cover" appends one). The Cover section in
  // the "Trang sách" tab shows them all — selected one labelled "Bìa", the rest by
  // origin — instead of only the single live cover. Legacy books (none) fall back.
  const coverCandidates = (b.data?.coverCandidates ?? []) as CoverCandidate[];
  const selectedCoverCandidateId = typeof b.data?.selectedCoverCandidateId === "string" ? b.data.selectedCoverCandidateId : undefined;
  const sourceCovers = (b.data?.sourceCovers ?? []) as SourceCover[];
  // "Trang sách" tab: colorized pages get their OWN "Colored" section (colored
  // result), while the Interior section still lists EVERY page as B&W line-art.
  // Keep each page's ORIGINAL index (for labels + preview prev/next via openPageAt).
  const coloredPages = pages.map((p, i) => ({ p, i })).filter((x) => Boolean(x.p.coloredUrl));
  const specs = b.specifications;
  const edited = Boolean(getBookPatch(bookId));

  const nav = (path: string) => () => router.push(path);

  const openPageAt = (i: number) => {
    if (i < 0 || i >= pages.length) return;
    const p = pages[i];
    const bw = resolveImg(p.url);
    const colored = resolveImg(p.coloredUrl);
    // Analyze data copied from the source clone job (scene/characters/locations/prompt).
    const scene = parsePageScene(p);
    const env = scene.environment;
    const envLine = env ? [env.mood, env.season, env.weather, env.timeOfDay].filter(Boolean).join(" · ") : "";
    const info: { label: string; value: ReactNode }[] = [
      { label: "Bản", value: p.coloredUrl ? "B&W + Màu (kéo để so sánh)" : "Line-art" },
      { label: "Công khai", value: p.isPublic ? "Có" : "Không" },
    ];
    if (scene.cameraView) info.push({ label: "Camera", value: scene.cameraView });
    if (envLine) info.push({ label: "Môi trường", value: envLine });
    setPreviewPage(p);
    setPreviewIdx(i);
    setPreview({
      title: `Trang ${String(i + 1).padStart(2, "0")}`,
      imageSrc: colored || bw,
      imageNode: colored && bw ? <ImageComparison beforeSrc={bw} afterSrc={colored} /> : undefined,
      badges: (
        <>
          <Badge tone={p.coloredUrl ? "success" : "neutral"}>{p.coloredUrl ? "Đã tô màu" : "B&W"}</Badge>
          {p.isPublic && <Badge tone="carbon">Công khai</Badge>}
          {hasSceneDetail(scene) && <Badge tone="neutral">Có analyze</Badge>}
        </>
      ),
      desc: hasSceneDetail(scene) ? <AnalyzePanel scene={scene} /> : undefined,
      info,
    });
  };

  const openCoverPreview = () => {
    setPreviewPage(null);
    setPreview({
      title: "Bìa trước",
      imageSrc: cover,
      badges: <><Badge tone="carbon">MÀU</Badge><Badge tone="carbon">THUMBNAIL</Badge></>,
      info: [
        { label: "Giá bán", value: b.price ? <span style={mono}>{b.price}</span> : "—" },
        { label: "Etsy", value: <span style={{ fontSize: 12.5 }}>{b.etsyListing?.etsyTitle || "—"}</span> },
      ],
      actions: (
        <>
          <Button variant="outline" size="sm" onClick={() => router.push(`${B}/books/${bookId}/cover`)}><Icon name="image" size={15} /> Cover editor</Button>
          {cover && (
            <a href={cover} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <Button variant="outline" size="sm"><Icon name="download" size={15} /> Tải ảnh</Button>
            </a>
          )}
        </>
      ),
    });
  };

  const openSourceCover = (s: SourceCover) => {
    const bw = resolveImg(s.url);
    const colored = resolveImg(s.coloredUrl);
    setPreviewPage(null);
    setPreviewIdx(null);
    setPreview({
      title: "Source Cover",
      imageSrc: colored || bw,
      imageNode: colored && bw ? <ImageComparison beforeSrc={bw} afterSrc={colored} /> : undefined,
      badges: <Badge tone={s.coloredUrl ? "success" : "neutral"}>{s.coloredUrl ? "Đã tô màu" : "B&W"}</Badge>,
      actions: (
        <PageActionsRow
          bookId={bookId}
          pages={pages}
          page={{ id: s.id, url: s.url, coloredUrl: s.coloredUrl, isPublic: s.isPublic } as BookColoringPage}
          bookData={(b.data ?? undefined) as Record<string, unknown> | undefined}
          onRemoved={closePreview}
          variant="sourceCover"
          sourceCover={s}
        />
      ),
    });
  };

  // Shared cover block — identical UI/UX in both the "Tổng quan" and "Trang sách"
  // tabs (single source of truth so the two can't drift out of sync again).
  const coverCard = (
    <Card title={coverCandidates.length > 0 ? `Cover Candidates · ${coverCandidates.length}` : "Cover"}>
      {coverCandidates.length > 0 ? (
        <CoverCandidatesStrip
          bookId={bookId}
          candidates={coverCandidates}
          selectedId={selectedCoverCandidateId}
          onPreview={(url, title) => { setPreviewPage(null); setPreviewIdx(null); setPreview({ title, imageSrc: resolveImg(url) }); }}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
          {cover ? (
            <Thumb src={cover} caption="Bìa hiện tại" badge="BÌA" onClick={openCoverPreview} />
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Chưa có cover candidate.</div>
          )}
        </div>
      )}
    </Card>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={nav(`${B}/books`)}><Icon name="arrow-left" size={16} /> Sách</Button>
      </div>

      {/* header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{b.title}</h1>
          {b.isPublic ? <Badge tone="success" dot>Đã duyệt</Badge> : <Badge tone="neutral">Nháp</Badge>}
          {b.isPremium && <Badge tone="carbon">Premium</Badge>}
          {edited && <Badge tone="warning">Đã sửa · local</Badge>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!b.isPublic && (
            <Button size="sm" disabled={!COLORING_WRITE_ENABLED || busy}
              title={COLORING_WRITE_ENABLED ? "Duyệt sách này (chuyển sang Đã duyệt)" : "Cần bật ghi thật (staging)"}
              onClick={async () => {
                if (!window.confirm("Duyệt sách này? Sách sẽ chuyển sang trạng thái Đã duyệt.")) return;
                setBusy(true); setMsg(null);
                try { await approveBook(); setMsg({ ok: "Đã duyệt sách" }); }
                catch (e) { setMsg({ err: e instanceof Error ? e.message : "Duyệt thất bại" }); }
                finally { setBusy(false); }
              }}>
              <Icon name="check" size={16} /> Duyệt sách
            </Button>
          )}
          {relatedJobId && (
            <Button variant="outline" size="sm" onClick={nav(`${B}/jobs/${relatedJobId}`)} title="Mở clone job đã tạo sách này để so sánh trang">
              <Icon name="copy" size={16} /> Job liên quan
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={nav(`${B}/books/${bookId}/edit`)}><Icon name="pen-line" size={16} /> Sửa thông tin</Button>
          <Button variant="outline" size="sm" onClick={nav(`${B}/books/${bookId}/cover`)}><Icon name="image" size={16} /> Cover editor</Button>
          <Button variant="outline" size="sm" onClick={makePdf} disabled={busy}><Icon name="file-text" size={16} /> {busy ? "Đang tạo…" : b.pdfUrl ? "Tạo lại PDF" : "Tạo PDF"}</Button>
          {resolveImg(b.pdfUrl) && (
            <Button variant="outline" size="sm" onClick={() => window.open(resolveImg(b.pdfUrl)!, "_blank", "noopener")}><Icon name="download" size={16} /> Tải PDF</Button>
          )}
          <Button variant="outline" size="sm" title="Xuất ảnh sách (Main + Clone, cover + interior) ra file ZIP các PNG lẻ"
            onClick={() => window.open(`${COLORING_API_BASE}/books/${bookId}/export-zip`, "_blank")}>
            <Icon name="download" size={16} /> Export ZIP
          </Button>
          <Button variant="outline" size="sm" disabled={!COLORING_WRITE_ENABLED || busy} title={COLORING_WRITE_ENABLED ? undefined : "Cần bật ghi thật (staging)"}
            onClick={async () => { setBusy(true); setMsg(null); try { await genSubtitle(); setMsg({ ok: "Đã sinh phụ đề" }); } catch (e) { setMsg({ err: e instanceof Error ? e.message : "Thất bại" }); } finally { setBusy(false); } }}>
            <Icon name="sparkles" size={16} /> Sinh phụ đề AI
          </Button>
          <Button variant="outline" size="sm" disabled={!COLORING_WRITE_ENABLED || busy} title={COLORING_WRITE_ENABLED ? undefined : "Cần bật ghi thật (staging)"}
            onClick={async () => {
              if (!window.confirm("Re-clone sách này? Sẽ tạo clone job MỚI để chạy lại toàn bộ pipeline (analyze → redesign → reproduce → tạo book). Tốn phí AI; book hiện tại vẫn giữ.")) return;
              setBusy(true); setMsg(null);
              try { const jobId = await reclone(); router.push(`${B}/jobs/${jobId}`); }
              catch (e) { setMsg({ err: e instanceof Error ? e.message : "Re-clone thất bại" }); setBusy(false); }
            }}>
            <Icon name="copy" size={16} /> {busy ? "Đang xử lý…" : "Re-clone"}
          </Button>
          <Button variant="outline" size="sm" disabled={!COLORING_WRITE_ENABLED || busy}
            title={COLORING_WRITE_ENABLED ? "Xoá vĩnh viễn sách này" : "Cần bật ghi thật (staging)"}
            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
            onClick={async () => {
              if (!window.confirm(`Xoá vĩnh viễn sách "${b.title}"? Hành động này không thể hoàn tác.`)) return;
              setBusy(true); setMsg(null);
              try { await deleteBook(); router.push(`${B}/books`); }
              catch (e) { setMsg({ err: e instanceof Error ? e.message : "Xoá thất bại" }); setBusy(false); }
            }}>
            <Icon name="trash-2" size={16} /> Xoá sách
          </Button>
        </div>
      </div>

      {/* meta line */}
      <p style={{ margin: "-8px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
        {b.category || "Chưa phân loại"}
        {specs?.pages ? ` · ${specs.pages} trang` : ""}
        {b.price ? <> · <span style={mono}>{b.price}</span></> : ""}
      </p>

      {msg && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: msg.err ? "var(--danger-bg)" : "var(--success-bg)", color: msg.err ? "var(--danger)" : "var(--success)" }}>{msg.err || msg.ok}</div>
      )}

      {/* stats card — Etsy/sales data has no endpoint yet */}
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 16 }}>
          <Stat label="Đã bán" value="—" />
          <Stat label="Doanh thu" value="—" />
          <Stat label="Views 30 ngày" value="—" />
          <Stat label="Favorites" value="—" />
          <Stat label="Chi phí AI" value="—" />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 10 }}>Số liệu Etsy/chi phí chưa có endpoint — sẽ hiện khi backend cung cấp.</div>
      </Card>

      {/* two columns */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        {/* left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: "1 1 260px", minWidth: 240, maxWidth: 340 }}>
          <Card>
            <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt={b.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Icon name="image" size={26} />
              )}
            </div>
            <AttrRow label="Giá bán"><span style={{ ...mono, fontWeight: 600, fontSize: 16 }}>{b.price || "—"}</span></AttrRow>
            <AttrRow label="Etsy listing" last>
              <span style={{ fontSize: 12.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: 180, whiteSpace: "nowrap", verticalAlign: "bottom" }}>{b.etsyListing?.etsyTitle || "—"}</span>
            </AttrRow>
          </Card>

          <Card title="Thuộc tính">
            <AttrRow label="Danh mục">{b.category || "—"}</AttrRow>
            <AttrRow label="Số trang"><span style={mono}>{specs?.pages ?? pages.length}</span></AttrRow>
            <AttrRow label="Kích thước">{specs?.dimensions || "—"}</AttrRow>
            <AttrRow label="Độ tuổi" last={!b.tags?.length}>{specs?.ageRange || "—"}</AttrRow>
            {b.tags && b.tags.length > 0 && (
              <div style={{ padding: "8px 0 0" }}>
                <div style={{ color: "var(--muted-foreground)", marginBottom: 8, fontSize: 13.5 }}>Keywords</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{b.tags.map((t, i) => <Badge tone="neutral" key={i}>{t}</Badge>)}</div>
              </div>
            )}
          </Card>

          <Card title="Tô màu AI">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--muted-foreground)" }}>Trang đã tô</span>
                <span style={{ ...mono, fontWeight: 600 }}>{colored}/{pages.length}</span>
              </div>
              <Progress value={pages.length ? Math.round((colored / pages.length) * 100) : 0} />
              <Button variant="outline" size="sm" onClick={nav(`${B}/books/${bookId}/colorize`)} style={{ width: "100%" }}>Tô lại với style khác</Button>
            </div>
          </Card>
        </div>

        {/* right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: "3 1 420px", minWidth: 0 }}>
          <Tabs<"info" | "meta" | "pages" | "select">
            items={[
              { key: "info", label: "Tổng quan" },
              { key: "meta", label: "Thông tin" },
              { key: "pages", label: `Trang sách · ${pages.length}` },
              { key: "select", label: "Chọn hình" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "info" ? (
            <>
              {coverCard}
              {b.description && (
                <Card title="Mô tả"><div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{b.description}</div></Card>
              )}
              <BookOriginalSection jobId={relatedJobId ?? cloneJobId ?? null} sourceCoverFallback={coverMetaObj.sourceThumbnailUrl} />
            </>
          ) : tab === "meta" ? (
            <BookInformationTab b={b} pages={pages} />
          ) : tab === "pages" ? (
            <>
              {coverCard}
              <SourceCoverSection bookId={bookId} interiors={pages} sourceCovers={sourceCovers} onOpen={openSourceCover} />
              <Card>
              {pages.length === 0 && (b.summaryPages ?? []).length === 0 ? (
                <EmptyState icon="image" title="Chưa có trang" sub="Sách này chưa có trang tô màu." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {coloredPages.length > 0 && (
                    <PageSection tone="colored" count={coloredPages.length} label="Interior Colored">
                      {coloredPages.map(({ p, i }) => {
                        const label = deriveBookPageLabel(p, i, pages);
                        return (
                          <PageThumb
                            key={p.id || i}
                            page={p}
                            displayNumber={label.displayNumber}
                            tone="colored"
                            onClick={() => openPageAt(i)}
                          />
                        );
                      })}
                    </PageSection>
                  )}
                  {sourceCovers.some((s) => s.coloredUrl) && (
                    <PageSection tone="colored" count={sourceCovers.filter((s) => s.coloredUrl).length} label="Source Cover Colored">
                      {sourceCovers.filter((s) => s.coloredUrl).map((s) => (
                        <PageThumb
                          key={`sc-${s.id}`}
                          page={{ id: s.id, url: s.url, coloredUrl: s.coloredUrl, isPublic: s.isPublic } as BookColoringPage}
                          displayNumber="SC"
                          tone="colored"
                          onClick={() => openSourceCover(s)}
                        />
                      ))}
                    </PageSection>
                  )}
                  {(b.summaryPages ?? []).length > 0 && (
                    <PageSection tone="intro" count={(b.summaryPages ?? []).length}>
                      {(b.summaryPages ?? []).map((s, i) => (
                        <PageThumb
                          key={s.id || i}
                          page={{ id: s.id, url: s.url, isPublic: s.isPublic } as BookColoringPage}
                          displayNumber={s.sourcePageNumber != null ? `#${s.sourcePageNumber}` : `#${i + 1}`}
                          tone="intro"
                          onClick={() => { setPreviewPage(null); setPreview({ title: `Intro ${i + 1}`, imageSrc: resolveImg(s.url) }); }}
                        />
                      ))}
                    </PageSection>
                  )}
                  {pages.length > 0 && (
                    <PageSection tone="interior" count={pages.length}>
                      {pages.map((p, i) => {
                        const label = deriveBookPageLabel(p, i, pages);
                        return (
                          <PageThumb
                            key={p.id || i}
                            // Interior always shows the B&W line-art (strip coloredUrl so the
                            // thumb falls back to page.url + hides the "MÀU" badge). Colorized
                            // pages still appear here as B&W AND in the Colored section.
                            page={{ ...p, coloredUrl: undefined }}
                            displayNumber={label.displayNumber}
                            tone={bookPageTone("interior", p)}
                            onClick={() => openPageAt(i)}
                          />
                        );
                      })}
                    </PageSection>
                  )}
                </div>
              )}
              </Card>
            </>
          ) : (
            <Card title="Chọn hình · Regen hàng loạt">
              <PageBatchSelect bookId={bookId} pages={pages} cloneJobId={cloneJobId} />
            </Card>
          )}
        </div>
      </div>

      <PreviewModal
        open={!!preview}
        onClose={closePreview}
        {...(preview ?? {})}
        counter={previewIdx != null ? `${previewIdx + 1} / ${pages.length}` : undefined}
        onPrev={previewIdx != null && previewIdx > 0 ? () => openPageAt(previewIdx - 1) : undefined}
        onNext={previewIdx != null && previewIdx < pages.length - 1 ? () => openPageAt(previewIdx + 1) : undefined}
        actions={previewPage ? <PageActionsRow bookId={bookId} pages={pages} page={previewPage} bookData={(b.data ?? undefined) as Record<string, unknown> | undefined} onRemoved={closePreview} /> : preview?.actions}
      />
    </div>
  );
}
