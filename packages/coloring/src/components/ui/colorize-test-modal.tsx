"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../lib/icon";
import { Button } from "./button";
import { Badge } from "./badge";
import { useStyleTest } from "../../data/use-more-actions";
import { uploadImageFile } from "../../data/use-upload-image";

export interface ColorizeTestModalProps {
  open: boolean;
  onClose: () => void;
  styleName: string;
  /** Coloring-style reference images (already resolved URLs), shown left as the target look. */
  referenceImages: string[];
  /** Directive fed to the colorizer. */
  colorizationDirective: string;
  /** Raw reference URLs passed to the test endpoint (server resolves them). */
  referenceImageUrls: string[];
}

/**
 * Test-colorize a page against a coloring style in a modal:
 *  - LEFT: the style's reference images (target look).
 *  - RIGHT: drop/choose a B&W page → colorize → scroll a book-page-style view
 *    comparing the colored result against the original (slider + stacked full images).
 */
export function ColorizeTestModal({ open, onClose, styleName, referenceImages, colorizationDirective, referenceImageUrls }: ColorizeTestModalProps) {
  const styleTest = useStyleTest("coloring-styles");
  const fileRef = useRef<HTMLInputElement>(null);
  const [origUrl, setOrigUrl] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [colored, setColored] = useState<string>("");
  const [busy, setBusy] = useState<"colorizing" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Reset everything when the modal closes; revoke the object URL to avoid leaks.
  useEffect(() => {
    if (open) return;
    setOrigUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    setFile(null); setColored(""); setErr(null); setBusy(null); setDragOver(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    setErr(null); setColored("");
    setOrigUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setFile(f);
  };

  const colorize = async () => {
    if (!file) return;
    setBusy("colorizing"); setErr(null);
    try {
      const uploaded = await uploadImageFile(file, "style-test");
      const url = await styleTest.test({ imageUrl: uploaded, colorizationDirective, referenceImageUrls });
      if (!url) throw new Error("Không nhận được ảnh đã tô.");
      setColored(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tô màu thất bại");
    } finally {
      setBusy(null);
    }
  };

  const reset = () => { setColored(""); setErr(null); };

  const capLabel = { fontSize: 11, fontWeight: 600 as const, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "var(--tracking-caps)" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", width: "min(960px, 100%)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", animation: "mo-dd-in var(--dur-med) var(--ease-out)" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Icon name="palette" size={18} />
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>Test tô màu — {styleName}</h3>
          </div>
          <button type="button" className="mo-hbtn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button>
        </div>

        {/* body: LEFT reference · RIGHT workspace */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: 18, display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 20 }}>
          {/* LEFT: style reference images */}
          <div style={{ minWidth: 0, minHeight: 0, overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={capLabel}>Ảnh tham chiếu style</div>
            {referenceImages.length > 0 ? (
              referenceImages.map((src, i) => (
                <div key={i} style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--neutral-100)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`ref ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Style chưa có ảnh tham chiếu — chỉ dùng directive.</div>
            )}
          </div>

          {/* RIGHT: workspace */}
          <div style={{ minWidth: 0, minHeight: 0, overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 14 }}>
            {!colored ? (
              <>
                <div
                  className={`mo-drop${dragOver ? " mo-drop--filled" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                  style={{ minHeight: origUrl ? undefined : 220 }}
                >
                  {origUrl ? (
                    <div style={{ width: "100%", maxWidth: 360, aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={origUrl} alt="ảnh gốc" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                  ) : (
                    <>
                      <Icon name="upload" size={24} />
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Kéo thả hoặc bấm để chọn ảnh B&W</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Ảnh line-art cần tô thử theo style này</div>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />

                {err && <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {origUrl && <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Đổi ảnh</Button>}
                  <Button size="sm" disabled={!file || !styleTest.enabled || busy !== null} title={styleTest.enabled ? undefined : "Cần bật ghi thật (staging)"} onClick={colorize}>
                    <Icon name="palette" size={16} /> {busy === "colorizing" ? "Đang tô…" : "Tô màu thử"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={capLabel}>Kết quả</span>
                  <Badge tone="success" dot>Đã tô màu</Badge>
                  <span style={{ flex: 1 }} />
                  <Button variant="outline" size="sm" onClick={reset}><Icon name="upload" size={14} /> Tô ảnh khác</Button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted-foreground)", fontSize: 12 }}>
                  <Icon name="arrow-left" size={13} /> Vuốt/scroll ngang để đổi <b style={{ color: "var(--foreground)" }}>Đã tô</b> ↔ <b style={{ color: "var(--foreground)" }}>Gốc</b> <Icon name="chevron-right" size={13} />
                </div>
                {/* single frame, horizontal scroll-snap between the two versions */}
                <div style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "#fff", scrollbarWidth: "none" }}>
                  {[{ label: "Đã tô màu", src: colored }, { label: "Hình gốc (B&W)", src: origUrl }].map((s) => (
                    <div key={s.label} style={{ position: "relative", flex: "0 0 100%", scrollSnapAlign: "start", aspectRatio: "1 / 1" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.src} alt={s.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                      <span style={{ position: "absolute", left: 10, top: 10, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "rgba(11,13,12,.55)", color: "#fff" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
                {err && <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
