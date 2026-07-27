"use client";

import { useState } from "react";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/states";
import { usePipelineActions, type CandidateKind } from "../../data/use-pipeline-actions";
import type { CloneJobPage } from "../../data/types";

const mono = { fontFamily: "var(--font-mono)" as const };
const capLabel = { fontSize: 11, fontWeight: 600 as const, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "var(--tracking-caps)" };

function reproduced(p: CloneJobPage): string | undefined {
  return p.reproducedUrl || p.redesignedUrl;
}

function Candidate({ label, src, hint, selected, empty, onChoose, disabled, busy, regen }: { label: string; src?: string; hint?: string; selected?: boolean; empty?: boolean; onChoose?: () => void; disabled?: boolean; busy?: boolean; regen?: { label: string; onClick: () => void; busy?: boolean } }) {
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
    </div>
  );
}

export function JobCompareTab({ jobId, pages }: { jobId: string; pages: CloneJobPage[] }) {
  const [sel, setSel] = useState(0);
  const pa = usePipelineActions(jobId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
  const angle = page.angleCandidateUrl;
  const redesign = page.redesignCandidateUrl || redo;
  const raw = page.rawData;
  const scene = raw?.scene;
  const sceneDesc = typeof scene === "string" ? scene : scene?.description;
  const cameraView = typeof scene === "object" && scene ? scene.cameraView : undefined;
  const chars = raw?.characters?.map((c) => c.name).filter(Boolean).join(" · ");
  const locs = raw?.locations?.map((l) => l.name).filter(Boolean).join(" · ");
  const hasAnalyze = Boolean(sceneDesc || cameraView || chars || locs);

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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <Candidate label="Hình gốc" src={page.imageUrl} />
            <Candidate label="Redesign 30%" src={redesign} selected={!!redo && redesign === redo} empty
              disabled={!pa.enabled} busy={busy === "redesign"}
              onChoose={run("redesign", () => pa.applyCandidate(idx, "redesign"))}
              regen={{ label: redesign ? "Regen 30%" : "Tạo bản 30%", busy: busy === "regen30", onClick: run("regen30", () => pa.regenPage(idx, 30)) }} />
            <Candidate label="30% + đổi camera" src={angle} hint={angle ? "Gợi ý" : undefined} selected={!!redo && angle === redo} empty
              disabled={!pa.enabled} busy={busy === "angle"}
              onChoose={run("angle", () => pa.applyCandidate(idx, "angle"))}
              regen={{ label: angle ? "Regen camera" : "Tạo bản camera", busy: busy === "regencam", onClick: run("regencam", () => pa.regenPage(idx, 30)) }} />
          </div>

          {err && <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}

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
