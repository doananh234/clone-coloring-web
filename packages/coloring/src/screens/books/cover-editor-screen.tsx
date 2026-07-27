"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Tabs } from "../../components/ui/tabs";
import { Select, Slider, Switch } from "../../components/ui/form-controls";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { useBook } from "../../data/use-book";
import { useEntityList } from "../../data/use-entity-list";
import { useSaveCover } from "../../data/use-cover-actions";
import { resolveImg } from "../../data/img";
import { composeCover } from "../../lib/compose-cover";
import { CoverCanvas, type CoverLayout } from "./cover-canvas";

const FONTS = ["Space Grotesk", "Geist", "Geist Mono"];
// Hex so the native color picker + canvas share one value.
const SWATCHES = ["#1a1712", "#8a8070", "#c9852a", "#ffffff", "#dd5245", "#4e8ff2"];
const DEFAULT_LAYOUT: CoverLayout = { title: { x: 50, y: 30 }, sub: { x: 50, y: 62 }, badge: { x: 50, y: 88 }, titleSize: 30, color: "#0b0d0c" };

export function CoverEditorScreen({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { book, isLoading, isError } = useBook(bookId);
  const { items: styles } = useEntityList("coloring-styles");
  const saveCover = useSaveCover(bookId);
  const [tab, setTab] = useState<"text" | "ai">("text");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [font, setFont] = useState(FONTS[0]);
  const [layout, setLayout] = useState<CoverLayout>(DEFAULT_LAYOUT);
  const [busy, setBusy] = useState<"save" | "export" | null>(null);
  const [msg, setMsg] = useState<{ err?: string; ok?: string } | null>(null);
  // AI tab
  const [prompt, setPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState("");
  const [keepText, setKeepText] = useState(true);

  useEffect(() => {
    if (book) {
      setTitle((t) => t || book.title || "");
      setSubtitle((s) => s || book.subtitle || "");
    }
  }, [book]);

  if (isLoading) return <Card><LoadingRows rows={5} /></Card>;
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

  // Text tab edits on the CLEAN illustration (no baked-in text), matching the
  // old editor: coverMeta.sourceThumbnailUrl → square/thumbnail (kept text-free).
  const coverMeta = (book.data?.coverMeta ?? {}) as { sourceThumbnailUrl?: string };
  const cleanBase = resolveImg(coverMeta.sourceThumbnailUrl || book.squareThumbnailUrl || book.thumbnailUrl || book.coverUrl);
  // Cover (with text) is only the "current" reference in the AI tab.
  const cover = resolveImg(book.coverUrl || book.squareThumbnailUrl || book.thumbnailUrl);
  const brand = "";
  const styleOptions = styles.map((s) => ({ label: s.name, value: s.id }));
  const badge = book.specifications?.pages ? `${book.specifications.pages} trang tô màu` : "";
  const coverText = { title, subtitle, badge };

  const doExport = async () => {
    if (!cleanBase) { setMsg({ err: "Chưa có ảnh nền để render." }); return; }
    setBusy("export"); setMsg(null);
    try {
      const { blob } = await composeCover(cleanBase, coverText, layout, font);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cover-${bookId}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: "Đã xuất PNG." });
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : "Xuất PNG thất bại." }); }
    finally { setBusy(null); }
  };

  const doSave = async () => {
    if (!cleanBase) { setMsg({ err: "Chưa có ảnh nền để lưu." }); return; }
    setBusy("save"); setMsg(null);
    try {
      const { base64 } = await composeCover(cleanBase, coverText, layout, font);
      await saveCover.save(base64);
      setMsg({ ok: "Đã lưu bìa (coverUrl)." });
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : "Lưu bìa thất bại." }); }
    finally { setBusy(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push(`${B}/books/${bookId}`)}>
            <Icon name="arrow-left" size={16} /> {book.title}
          </Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Cover editor</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" size="sm" onClick={doExport} disabled={busy !== null || !cleanBase} title={cleanBase ? undefined : "Chưa có ảnh nền"}>
              <Icon name="download" size={15} /> {busy === "export" ? "Đang xuất…" : "Xuất PNG"}
            </Button>
            <Button size="sm" onClick={doSave} disabled={busy !== null || !saveCover.enabled || !cleanBase} title={saveCover.enabled ? undefined : "Cần bật ghi thật (staging)"}>
              {busy === "save" ? "Đang lưu…" : "Lưu cover"}
            </Button>
          </div>
        </div>
        {msg && (
          <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: msg.err ? "var(--danger-bg)" : "var(--success-bg)", color: msg.err ? "var(--danger)" : "var(--success)" }}>
            {msg.err || msg.ok}
          </div>
        )}
      </div>

      <Tabs<"text" | "ai"> items={[{ key: "text", label: "Sửa chữ trên hình" }, { key: "ai", label: "Gen bằng AI" }]} value={tab} onChange={setTab} />

      {tab === "text" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "2 1 400px", minWidth: 0 }}>
            <CoverCanvas image={cleanBase} brand={brand} text={coverText} layout={layout} onLayout={setLayout} />
          </div>
          <div style={{ flex: "1 1 300px", minWidth: 280 }}>
            <Card title="Chữ đang chọn · Tiêu đề">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <label style={{ display: "block" }}><span className="mo-flabel">Tiêu đề</span><Input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                <label style={{ display: "block" }}><span className="mo-flabel">Phụ đề</span><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></label>
                <Select label="Font" value={font} onChange={setFont} options={FONTS} />
                <Slider label="Cỡ chữ" value={layout.titleSize} min={14} max={72} unit=" px" onChange={(v) => setLayout({ ...layout, titleSize: v })} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Màu chữ</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {SWATCHES.map((c) => (
                      <span key={c} className={`mo-swatch${layout.color.toLowerCase() === c ? " mo-swatch--on" : ""}`} style={{ background: c, borderColor: c === "#ffffff" && layout.color.toLowerCase() !== c ? "var(--neutral-300)" : undefined }} onClick={() => setLayout({ ...layout, color: c })} />
                    ))}
                    <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />
                    <input type="color" className="mo-colorpick" value={/^#[0-9a-fA-F]{6}$/.test(layout.color) ? layout.color : "#0b0d0c"} onChange={(e) => setLayout({ ...layout, color: e.target.value })} title="Chọn màu tùy ý" />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>{layout.color}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <Card title="Cấu hình gen">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Prompt bổ sung</div>
                  <textarea className="mo-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả bố cục bìa mong muốn…" style={{ minHeight: 70, padding: "12px 14px", lineHeight: 1.65, resize: "vertical" }} />
                </div>
                <Select label="Coloring style" value={aiStyle} onChange={setAiStyle} options={styleOptions} placeholder="Chọn style" />
                <Switch label="Giữ bố cục chữ hiện tại" checked={keepText} onChange={setKeepText} />
                <Button disabled={!COLORING_WRITE_ENABLED} style={{ width: "100%" }}><Icon name="sparkles" size={18} /> Gen 3 phương án</Button>
                {!COLORING_WRITE_ENABLED && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Gen AI cần bật ghi thật (staging) + backend.</div>}
              </div>
            </Card>
          </div>
          <div style={{ flex: "2 1 400px", minWidth: 0 }}>
            <Card title="Kết quả">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
                <div>
                  <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", position: "relative", overflow: "hidden", background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="hiện tại" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name="image" size={22} />
                    )}
                    <span style={{ position: "absolute", left: 8, top: 8, background: "var(--carbon-950)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99, letterSpacing: "var(--tracking-caps)" }}>HIỆN TẠI</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", marginTop: 6 }}>Bìa hiện tại</div>
                </div>
                {["A", "B", "C"].map((v) => (
                  <div key={v}>
                    <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", border: "1px dashed var(--neutral-300)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
                      <Icon name="sparkles" size={20} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", marginTop: 6 }}>Phương án {v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 12 }}>Bấm “Gen 3 phương án” để tạo các bản mới (cần backend AI).</div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
