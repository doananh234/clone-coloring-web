"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/form-controls";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { useCreateBook, useExtractEntities } from "../../data/use-job-actions";
import type { CloneJobDetail } from "../../data/types";

const ERR = { padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 };

/** Unique detected names across all analyzed pages, with the number of pages each appears on. */
function detectedNames(job: CloneJobDetail, key: "characters" | "locations"): { name: string; pages: number }[] {
  const counts = new Map<string, number>();
  for (const p of job.pages ?? []) {
    for (const e of p.rawData?.[key] ?? []) {
      const name = (e?.name ?? "").trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, pages]) => ({ name, pages })).sort((a, b) => b.pages - a.pages);
}

export function JobPipelineTab({ job, isLocal, onViewPages }: { job: CloneJobDetail; isLocal: boolean; onViewPages: () => void }) {
  const router = useRouter();
  const createBook = useCreateBook(job.id);
  const extract = useExtractEntities(job.id);
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wantChars, setWantChars] = useState(true);
  const [wantStory, setWantStory] = useState(true);
  const [wantLoc, setWantLoc] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);

  const detChars = detectedNames(job, "characters");
  const detLocs = detectedNames(job, "locations");

  if (isLocal) {
    return (
      <Card>
        <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13.5 }}>
          Job nháp local — pipeline thật (confirm / tạo book / extract) không áp dụng.
        </div>
      </Card>
    );
  }

  const doCreate = async () => {
    setCreating(true); setErr(null);
    try {
      const bookId = await createBook();
      router.push(`${B}/books/${bookId}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Tạo book thất bại"); setCreating(false); }
  };
  const doExtract = async () => {
    setExtracting(true); setErr(null);
    try { await extract(); setReviewOpen(false); setExtracting(false); } catch (e) { setErr(e instanceof Error ? e.message : "Extract thất bại"); setExtracting(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!COLORING_WRITE_ENABLED && (
        <div style={{ padding: "10px 12px", background: "var(--warning-bg)", color: "var(--warning)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>
          Đang ở chế độ local — các nút tạo book / extract chỉ chạy khi bật ghi thật (staging).
        </div>
      )}
      {err && <div style={ERR}>{err}</div>}

      <Card title="Confirm tạo book">
        {job.bookId ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Badge tone="success" dot>Đã tạo book</Badge>
              <span style={{ fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>{job.bookId.slice(0, 8)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push(`${B}/books/${job.bookId}`)}>Mở book</Button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Duyệt trang redesign &amp; tạo book</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Tạo book trong thư viện từ {job.totalPages} trang (dùng bản redesign)</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={onViewPages}>Xem trang</Button>
              <Button size="sm" onClick={doCreate} disabled={creating}>
                <Icon name="check" size={16} /> {creating ? "Đang tạo…" : "Duyệt & tạo book"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Extract nhân vật · story · bối cảnh">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Switch label="Nhân vật" checked={wantChars} onChange={setWantChars} />
            <Switch label="Story" checked={wantStory} onChange={setWantStory} />
            <Switch label="Location context" checked={wantLoc} onChange={setWantLoc} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Phát hiện <strong>{detChars.length}</strong> nhân vật · <strong>{detLocs.length}</strong> bối cảnh từ {job.analyzedPages} trang đã analyze (Story chưa có backend — bỏ qua).
            </div>
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)} disabled={extracting}>
              {extracting ? "Đang extract…" : "Xem & extract"}
            </Button>
          </div>
        </div>
      </Card>

      {reviewOpen && (
        <ExtractReviewModal
          chars={detChars}
          locs={detLocs}
          wantChars={wantChars}
          wantLoc={wantLoc}
          extracting={extracting}
          onConfirm={doExtract}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}

function DetectedList({ title, items, muted }: { title: string; items: { name: string; pages: number }[]; muted?: boolean }) {
  return (
    <div style={{ opacity: muted ? 0.45 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        <Badge tone="neutral">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Không phát hiện.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((it) => (
            <span key={it.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 99, fontSize: 12.5, background: "var(--card)" }}>
              {it.name}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>×{it.pages}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Review detected characters/locations before firing extract-entities (no-op logic, read-only preview + confirm). */
function ExtractReviewModal({
  chars, locs, wantChars, wantLoc, extracting, onConfirm, onClose,
}: {
  chars: { name: string; pages: number }[];
  locs: { name: string; pages: number }[];
  wantChars: boolean;
  wantLoc: boolean;
  extracting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const nothing = (!wantChars || chars.length === 0) && (!wantLoc || locs.length === 0);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", width: "min(560px,100%)", maxHeight: "88vh", overflow: "auto", animation: "mo-dd-in var(--dur-med) var(--ease-out)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>Duyệt thực thể phát hiện</h3>
          <button type="button" className="mo-hbtn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
            Xem lại nhân vật &amp; bối cảnh được phát hiện từ các trang đã analyze. Extract sẽ tạo/gắn reference cho các mục dưới đây.
          </div>
          <DetectedList title="Nhân vật" items={chars} muted={!wantChars} />
          <DetectedList title="Bối cảnh" items={locs} muted={!wantLoc} />
          {nothing && <div style={{ fontSize: 12.5, color: "var(--warning)" }}>Không có thực thể nào để extract theo lựa chọn hiện tại.</div>}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Hủy</Button>
          <Button size="sm" onClick={onConfirm} disabled={extracting || nothing}>
            <Icon name="check" size={16} /> {extracting ? "Đang extract…" : "Xác nhận extract"}
          </Button>
        </div>
      </div>
    </div>
  );
}
