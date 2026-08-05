"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { usePipelineActions, type CandidateKind } from "../../data/use-pipeline-actions";
import { useStyleFromImage } from "../../data/use-more-actions";
import { useCoverDesign, type CoverStylePack } from "../../data/use-cover-design";
import { useCoverTextOverlays } from "../../data/use-cover-text-overlays";
import { resolveImg } from "../../data/img";
import { useBook } from "../../data/use-book";
import type { CloneJobPage } from "../../data/types";

const mono = { fontFamily: "var(--font-mono)" as const };
const capLabel = { fontSize: 11, fontWeight: 600 as const, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "var(--tracking-caps)" };

function reproduced(p: CloneJobPage): string | undefined {
  return p.reproducedUrl || p.redesignedUrl;
}

const OVERLAY_ROLE_LABELS: Record<string, string> = {
  title: "Tiêu đề",
  subtitle: "Phụ đề",
  brand: "Thương hiệu",
  badge: "Badge",
};

/** Compact read-only preview of an extracted CoverStylePack.elements, one row per role. */
function OverlayPreview({ elements }: { elements: NonNullable<CoverStylePack["elements"]> }) {
  const roles: (keyof NonNullable<CoverStylePack["elements"]>)[] = ["title", "subtitle", "brand", "badge"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
      {roles.map((role) => {
        const el = elements[role];
        const present = Boolean(el?.present);
        return (
          <div key={role} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ ...capLabel, width: 78, flexShrink: 0 }}>{OVERLAY_ROLE_LABELS[role]}</span>
            <span style={{ width: 14, flexShrink: 0, color: present ? "var(--success)" : "var(--muted-foreground)" }}>
              {present ? <Icon name="check" size={13} stroke={3} /> : "—"}
            </span>
            {present && el ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: "var(--muted-foreground)" }}>
                {el.color && <span style={{ width: 12, height: 12, borderRadius: 99, border: "1px solid var(--border)", background: el.color, flexShrink: 0 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[el.fontFamily, el.fontWeight, el.color].filter(Boolean).join(" · ")}
                  {(el.xNorm != null || el.yNorm != null) && ` · pos (${Math.round((el.xNorm ?? 0) * 100)}%, ${Math.round((el.yNorm ?? 0) * 100)}%)`}
                  {el.fontSizeNorm != null && ` · size ${Math.round(el.fontSizeNorm * 100)}%`}
                </span>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Candidate({ label, src, hint, selected, empty, onChoose, disabled, busy, regen, footer }: { label: string; src?: string; hint?: string; selected?: boolean; empty?: boolean; onChoose?: () => void; disabled?: boolean; busy?: boolean; regen?: { label: string; onClick: () => void; busy?: boolean }; footer?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={capLabel}>{label}</span>
        {hint && <Badge tone="carbon">{hint}</Badge>}
      </div>
      <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", border: `${selected ? 2 : 1}px solid ${selected ? "var(--volt-600)" : "var(--border)"}`, boxShadow: selected ? "var(--shadow-glow)" : undefined, background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />
        ) : (
          <span style={{ fontSize: 12 }}>{empty ? "Chưa có bản" : "—"}</span>
        )}
        {selected && (
          <span style={{ position: "absolute", right: 8, top: 8, width: 20, height: 20, borderRadius: 99, background: "var(--volt-500)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--carbon-950)" }}>
            <Icon name="check" size={12} stroke={3} />
          </span>
        )}
      </div>
      {onChoose && src && (
        selected
          ? <Button size="sm" style={{ width: "100%" }} disabled><Icon name="check" size={14} /> Đang chọn</Button>
          : <Button variant="outline" size="sm" style={{ width: "100%" }} disabled={disabled || busy} onClick={onChoose}>{busy ? "…" : "Chọn bản này"}</Button>
      )}
      {regen && (
        <Button variant="ghost" size="sm" style={{ width: "100%" }} disabled={disabled || regen.busy} onClick={regen.onClick}>
          <Icon name="sparkles" size={14} /> {regen.busy ? "Đang tạo…" : regen.label}
        </Button>
      )}
      {footer}
    </div>
  );
}

export function JobCompareTab({ jobId, pages, bookId }: { jobId: string; pages: CloneJobPage[]; bookId?: string }) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const pa = usePipelineActions(jobId);
  // The book created from this job — to preview the cover currently in use.
  // Only shown on the first page (the cover is derived from the source page).
  const { book } = useBook(bookId || "");
  const coverUrl = resolveImg(book?.coverUrl ?? undefined);
  const styleSvc = useStyleFromImage("coloring-styles");
  const coverDesign = useCoverDesign();
  const overlays = useCoverTextOverlays();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [styleMsg, setStyleMsg] = useState<{ err?: string; okId?: string } | null>(null);
  const [changePct, setChangePct] = useState(30);
  // Extracted cover text overlay preview (style+layout per element), for the "Trích bố cục
  // chữ bìa" job-level control on the cover page (idx === 0). Mirrors saveColoringStyle below.
  const [ov, setOv] = useState<CoverStylePack["elements"] | null>(null);
  const [ovMsg, setOvMsg] = useState<{ err?: string; ok?: string } | null>(null);

  const run = (key: string, fn: () => Promise<void>, confirmMsg?: string) => async () => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setBusy(null);
    }
  };

  if (pages.length === 0) {
    return <Card><EmptyState icon="image" title="Chưa có trang" sub="Job chưa tách/redesign trang nào." /></Card>;
  }

  const idx = Math.min(sel, pages.length - 1);
  const page = pages[idx];
  const redo = reproduced(page);
  // Two candidate slots, matching the old clone-reproduce-step: "Regen" and
  // "Đổi camera" — BOTH generated via /reproduce (regenCandidateUrl / angleCandidateUrl),
  // applied via apply-candidate kind "regen" / "angle". (/redesign-page is a different,
  // earlier step and is NOT how the old UI's regen/camera buttons worked.)
  const regenCand = page.regenCandidateUrl;
  const angle = page.angleCandidateUrl;
  const angleView = page.angleCandidateView;
  const raw = page.rawData;
  const scene = raw?.scene;
  const sceneDesc = typeof scene === "string" ? scene : scene?.description;
  const cameraView = typeof scene === "object" && scene ? scene.cameraView : undefined;
  const chars = raw?.characters?.map((c) => c.name).filter(Boolean).join(" · ");
  const locs = raw?.locations?.map((l) => l.name).filter(Boolean).join(" · ");
  const hasAnalyze = Boolean(sceneDesc || cameraView || chars || locs);

  // Analyze the ORIGINAL (colored) source image → create a reusable coloring style.
  // The clone source's first page is typically the colored cover; extracting its
  // palette + directive lets us re-apply the same look to whatever page becomes
  // the new random cover.
  const saveColoringStyle = async () => {
    const src = page.imageUrl;
    if (!src) return;
    setBusy("savestyle");
    setStyleMsg(null);
    try {
      const parsed = await styleSvc.analyze([src]);
      const suggested = typeof parsed.name === "string" ? parsed.name : "";
      const name = window.prompt("Tên coloring style (từ hình gốc này):", suggested || `Style trang ${page.pageNumber}`);
      if (!name) { setBusy(null); return; }
      const { id } = await styleSvc.create({ ...parsed, name, referenceImageUrls: [src] });
      setStyleMsg({ okId: id ?? "" });
    } catch (e) {
      setStyleMsg({ err: e instanceof Error ? e.message : "Lưu coloring style thất bại" });
    } finally {
      setBusy(null);
    }
  };

  // Extract per-element STYLE + LAYOUT (title/subtitle/brand/badge) from the job's ORIGINAL
  // cover image (page 0, WITH text) — same source as saveColoringStyle above, different
  // target: a reusable CoverTextOverlay record instead of a ColoringStyle.
  const extractOverlay = async () => {
    const src = page.imageUrl;
    if (!src) return;
    setBusy("ovextract");
    setOvMsg(null);
    try {
      const p = await coverDesign.run(resolveImg(src) ?? src, {
        title: book?.title || `Coloring Book — Job ${jobId}`,
        category: book?.category || undefined,
      });
      setOv(p.elements ?? null);
      if (!p.elements) setOvMsg({ err: "Không trích được bố cục chữ từ hình gốc." });
    } catch (e) {
      setOvMsg({ err: e instanceof Error ? e.message : "Trích bố cục chữ bìa thất bại" });
    } finally {
      setBusy(null);
    }
  };

  const saveOverlay = async () => {
    if (!ov) return;
    const name = window.prompt("Tên bố cục chữ bìa:", `${book?.title || "Job " + jobId} — bố cục`);
    if (!name) return;
    setBusy("ovsave");
    setOvMsg(null);
    try {
      await overlays.create(name, ov, page.imageUrl ?? null);
      setOvMsg({ ok: `Đã lưu bố cục "${name}".` });
    } catch (e) {
      setOvMsg({ err: e instanceof Error ? e.message : "Lưu bố cục chữ bìa thất bại" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="So sánh & chọn redesign theo trang">
      <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        {/* page strip */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignSelf: "start", position: "sticky", top: 0, height: "min(72vh, 640px)", overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
          {pages.map((p, i) => {
            const active = i === idx;
            const has = Boolean(reproduced(p));
            return (
              <div key={p.pageNumber} onClick={() => setSel(i)} style={{ position: "relative", flexShrink: 0, width: "100%", aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: "var(--neutral-100)", border: `${active ? 2 : 1}px solid ${active ? "var(--volt-600)" : "var(--border)"}`, boxShadow: active ? "var(--shadow-glow)" : undefined, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", cursor: "pointer", overflow: "hidden" }}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={`Trang ${p.pageNumber}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Icon name="image" size={16} />
                )}
                <span style={{ position: "absolute", left: 4, bottom: 3, ...mono, fontSize: 10, color: "#fff", background: "rgba(11,13,12,.6)", padding: "0 4px", borderRadius: 4 }}>{String(p.pageNumber).padStart(2, "0")}</span>
                {has && <span style={{ position: "absolute", right: 3, top: 3, width: 14, height: 14, borderRadius: 99, background: "var(--volt-500)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--carbon-950)" }}><Icon name="check" size={9} stroke={3} /></span>}
              </div>
            );
          })}
        </div>

        {/* selected page */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>Trang {String(page.pageNumber).padStart(2, "0")}</span>
              {redo ? <Badge tone="success" dot>Đã chọn bản</Badge> : <Badge tone="warning">Chưa chọn bản</Badge>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" size="sm" disabled={idx === 0} onClick={() => setSel(idx - 1)}><Icon name="arrow-left" size={14} /> Trang {String(pages[Math.max(0, idx - 1)].pageNumber).padStart(2, "0")}</Button>
              <Button variant="outline" size="sm" disabled={idx === pages.length - 1} onClick={() => setSel(idx + 1)}>Trang {String(pages[Math.min(pages.length - 1, idx + 1)].pageNumber).padStart(2, "0")}</Button>
            </div>
          </div>

          {hasAnalyze && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontSize: 13 }}>
              {sceneDesc && <div><div style={{ ...capLabel, marginBottom: 4 }}>Analyze</div>{sceneDesc}</div>}
              {chars && <div><div style={{ ...capLabel, marginBottom: 4 }}>Nhân vật</div>{chars}</div>}
              {locs && <div><div style={{ ...capLabel, marginBottom: 4 }}>Bối cảnh</div>{locs}</div>}
              {cameraView && <div><div style={{ ...capLabel, marginBottom: 4 }}>Camera góc</div>{cameraView}</div>}
            </div>
          )}

          {/* Job-level: extract per-element STYLE + LAYOUT from the job's ORIGINAL cover
              (page 0, WITH text) → reusable CoverTextOverlay record. Parallel to
              "Lưu coloring style" above, but for text style+position instead of color. */}
          {idx === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={capLabel}>Bố cục chữ bìa (từ hình gốc)</span>
                <Button variant="outline" size="sm" disabled={!coverDesign.enabled || !page.imageUrl || busy !== null}
                  title={coverDesign.enabled ? "Trích style + vị trí chữ (title/subtitle/brand/badge) từ hình bìa gốc" : "Cần bật ghi thật (staging)"}
                  onClick={extractOverlay}>
                  <Icon name="type" size={14} /> {busy === "ovextract" ? "Đang trích…" : "Trích bố cục chữ bìa"}
                </Button>
                {ov && (
                  <Button size="sm" disabled={!overlays.enabled || busy !== null}
                    title={overlays.enabled ? "Lưu bố cục chữ đã trích thành record tái sử dụng" : "Cần bật ghi thật (staging)"}
                    onClick={saveOverlay}>
                    <Icon name="sparkles" size={14} /> {busy === "ovsave" ? "Đang lưu…" : "Lưu bố cục này"}
                  </Button>
                )}
              </div>

              {ov && <OverlayPreview elements={ov} />}

              {ovMsg?.err && <div style={{ padding: "8px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{ovMsg.err}</div>}
              {ovMsg?.ok && <div style={{ padding: "8px 10px", background: "var(--success-bg)", color: "var(--success)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{ovMsg.ok}</div>}
              {!coverDesign.enabled && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Trích bố cục chữ chỉ chạy khi bật ghi thật (staging).</div>}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={capLabel}>% thay đổi khi Regen / Đổi camera</span>
            <input type="number" min={5} max={95} step={5} value={changePct}
              onChange={(e) => setChangePct(Math.min(95, Math.max(5, Number(e.target.value) || 30)))}
              style={{ width: 72, padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--card)", color: "var(--foreground)" }} />
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>% cao = biến đổi mạnh hơn so với bản gốc (mặc định 30%).</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
            <Candidate label="Hình gốc" src={resolveImg(page.imageUrl)} footer={
              <Button variant="ghost" size="sm" style={{ width: "100%" }} disabled={!styleSvc.enabled || busy !== null || !page.imageUrl}
                title={styleSvc.enabled ? "Analyze hình gốc (màu) → tạo coloring style tái sử dụng" : "Cần bật ghi thật (staging)"}
                onClick={saveColoringStyle}>
                <Icon name="palette" size={14} /> {busy === "savestyle" ? "Đang lưu…" : "Lưu coloring style"}
              </Button>
            } />
            <Candidate
              label="Bản đã gen"
              src={idx === 0 ? (coverUrl ?? resolveImg(redo)) : resolveImg(redo)}
              hint={idx === 0 ? (coverUrl ? "Cover đang dùng" : undefined) : (redo ? "Đang dùng" : undefined)}
              empty
              footer={idx === 0 && bookId ? (
                <Button variant="outline" size="sm" style={{ width: "100%" }} onClick={() => router.push(`${B}/books/${bookId}/cover`)}>
                  <Icon name="image" size={14} /> Sửa bìa
                </Button>
              ) : undefined}
            />
            <Candidate label="Regen" src={resolveImg(regenCand)} selected={!!regenCand && page.reproducedUrl === regenCand} empty
              disabled={!pa.enabled} busy={busy === "applyregen"}
              onChoose={run("applyregen", () => pa.applyCandidate(idx, "regen"))}
              regen={{ label: regenCand ? "Regen lại" : "Tạo bản regen", busy: busy === "genregen", onClick: run("genregen", () => pa.regenCandidate(idx, false, changePct)) }} />
            <Candidate label={angleView ? `Đổi camera · ${angleView}` : "Đổi camera"} src={resolveImg(angle)} hint={angle ? "Góc mới" : undefined} selected={!!angle && page.reproducedUrl === angle} empty
              disabled={!pa.enabled} busy={busy === "applyangle"}
              onChoose={run("applyangle", () => pa.applyCandidate(idx, "angle"))}
              regen={{ label: angle ? "Đổi góc khác" : "Tạo góc mới", busy: busy === "genangle", onClick: run("genangle", () => pa.regenCandidate(idx, true, changePct)) }} />
          </div>

          {err && <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}
          {styleMsg?.err && <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{styleMsg.err}</div>}
          {styleMsg && !styleMsg.err && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--success-bg)", color: "var(--success)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>Đã lưu coloring style từ hình gốc.</span>
              {styleMsg.okId && (
                <Button variant="outline" size="sm" onClick={() => router.push(`${B}/entity/coloring-styles/${styleMsg.okId}`)}>
                  <Icon name="palette" size={14} /> Mở style
                </Button>
              )}
            </div>
          )}

          {/* job-level actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <span style={{ flex: 1 }} />
            <Button variant="outline" size="sm" disabled={!pa.enabled || busy !== null} onClick={run("analyze", () => pa.analyze(), "Chạy lại analyze toàn job? Tốn phí AI.")}>{busy === "analyze" ? "…" : "Re-analyze"}</Button>
            <Button variant="outline" size="sm" disabled={!pa.enabled || busy !== null} onClick={run("reproduce", () => pa.reproduce(), "Redesign lại toàn bộ trang? Tốn phí AI.")}>{busy === "reproduce" ? "…" : "Reproduce"}</Button>
            <Button variant="outline" size="sm" disabled={!pa.enabled || busy !== null} onClick={run("recheck", () => pa.recheck())}>{busy === "recheck" ? "…" : "Recheck"}</Button>
            <Button variant="outline" size="sm" disabled={!pa.enabled || busy !== null} onClick={run("sync", () => pa.syncOriginal())}>{busy === "sync" ? "…" : "Sync nguồn"}</Button>
          </div>
          {!pa.enabled && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Regen / apply / analyze / reproduce chỉ chạy khi bật ghi thật (staging).</div>}
        </div>
      </div>
    </Card>
  );
}
