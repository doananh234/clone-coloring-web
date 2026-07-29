"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs } from "../../components/ui/tabs";
import { Select, Switch } from "../../components/ui/form-controls";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { useBook } from "../../data/use-book";
import { useEntityList } from "../../data/use-entity-list";
import { useSaveCover, useGenerateCover, type GeneratedCover } from "../../data/use-cover-actions";
import { useCoverDesign, type CoverStylePack } from "../../data/use-cover-design";
import { resolveImg } from "../../data/img";
import { CoverFabricEditor, type CoverEditorHandle } from "./cover-fabric-editor";
import { CoverElementPanel } from "./cover-element-panel";
import { defaultCoverDoc, normalizeCoverDoc, type CoverDoc, type CoverElement, type CoverElementKey } from "../../lib/cover-doc";

export function CoverEditorScreen({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { book, isLoading, isError } = useBook(bookId);
  const { items: styles } = useEntityList("coloring-styles");
  const saveCover = useSaveCover(bookId);
  const genCover = useGenerateCover();
  const coverDesign = useCoverDesign();
  const [tab, setTab] = useState<"text" | "ai">("text");
  const editorRef = useRef<CoverEditorHandle>(null);
  const [doc, setDoc] = useState<CoverDoc | null>(null);
  const [selectedKey, setSelectedKey] = useState<CoverElementKey | null>("title");
  const [docLoaded, setDocLoaded] = useState(false);
  // Cover text-style extracted from the source cover (title/sub/brand fonts + colors).
  const [pack, setPack] = useState<CoverStylePack | null>(null);
  const [reBusy, setReBusy] = useState(false);
  const [busy, setBusy] = useState<"save" | "export" | null>(null);
  const [msg, setMsg] = useState<{ err?: string; ok?: string } | null>(null);
  // AI tab
  const [prompt, setPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState("");
  const [keepText, setKeepText] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<GeneratedCover[]>([]);

  // Seed the cover doc once the book loads (badge = page count, seeded from the
  // pack auto-extracted at create-book time). Restores from book.data.coverLayout
  // when present so edits persist across reloads.
  useEffect(() => {
    if (!book || docLoaded) return;
    const badge = book.specifications?.pages ? `${book.specifications.pages} trang tô màu` : "";
    const pack = (book.data?.coverStylePack ?? null) as CoverStylePack | null;
    const seed = {
      title: book.title || "",
      subtitle: book.subtitle || "",
      badge,
      titleFont: pack?.fontPairs?.[0]?.display,
      titleColor: pack?.palettes?.[0]?.primary,
    };
    const stored = book.data?.coverLayout;
    setDoc(stored ? normalizeCoverDoc(stored, seed) : defaultCoverDoc(seed));
    setPack(pack);
    setDocLoaded(true);
  }, [book, docLoaded]);

  const patchEl = (k: CoverElementKey, patch: Partial<CoverElement>) =>
    setDoc((d) => (d ? { ...d, elements: { ...d.elements, [k]: { ...d.elements[k], ...patch } } } : d));

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
  const styleOptions = styles.map((s) => ({ label: s.name, value: s.id }));

  // Apply the extracted pack onto the doc's title element (font + color only).
  const applyPackToDoc = (p: CoverStylePack) => {
    const f = p.fontPairs?.[0]?.display;
    const primary = p.palettes?.[0]?.primary;
    patchEl("title", {
      ...(f ? { fontFamily: f } : {}),
      ...(primary && /^#[0-9a-fA-F]{6}$/.test(primary) ? { color: primary } : {}),
    });
  };

  // Re-run cover-design on the source cover and re-apply font + color.
  const doReextract = async () => {
    if (!cleanBase) { setMsg({ err: "Chưa có ảnh nền để trích style." }); return; }
    setReBusy(true); setMsg(null);
    try {
      const p = await coverDesign.run(cleanBase, {
        title: doc?.elements.title.text || book.title || "Coloring Book",
        subtitle: doc?.elements.subtitle.text || undefined,
        category: book.category || undefined,
      });
      setPack(p);
      applyPackToDoc(p);
      setMsg({ ok: "Đã trích lại style từ bìa gốc." });
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : "Trích style thất bại." }); }
    finally { setReBusy(false); }
  };

  const doExport = async () => {
    if (!editorRef.current) return;
    setBusy("export"); setMsg(null);
    try {
      const { blob } = await editorRef.current.export();
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
    if (!editorRef.current || !doc) return;
    setBusy("save"); setMsg(null);
    try {
      const { base64 } = await editorRef.current.export();
      await saveCover.save(base64);
      await saveCover.saveLayout(doc);
      setMsg({ ok: "Đã lưu bìa (coverUrl + layout)." });
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : "Lưu bìa thất bại." }); }
    finally { setBusy(null); }
  };

  // AI cover: compose the book's colored pages + title into 3 candidate covers.
  const doGenAi = async () => {
    setAiErr(null); setAiResults([]); setAiBusy(true);
    try {
      const genTitle = `${book.title || "Coloring Book"}${prompt.trim() ? ` — ${prompt.trim()}` : ""}`;
      const pageImgs = (book.coloringPages ?? [])
        .map((p) => resolveImg(p.coloredUrl || p.url))
        .filter((u): u is string => Boolean(u))
        .slice(0, 6);
      const imgs = pageImgs.length ? pageImgs : cleanBase ? [cleanBase] : [];
      const out = await Promise.all([0, 1, 2].map(() => genCover.generate(genTitle, imgs)));
      setAiResults(out);
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Gen bìa AI thất bại."); }
    finally { setAiBusy(false); }
  };

  const applyAiCover = async (base64: string) => {
    setBusy("save"); setMsg(null);
    try { await saveCover.save(base64); setMsg({ ok: "Đã lưu bìa từ bản AI." }); }
    catch (e) { setMsg({ err: e instanceof Error ? e.message : "Lưu bìa thất bại." }); }
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
          <div style={{ flex: "2 1 420px", minWidth: 0 }}>
            {doc && (
              <CoverFabricEditor ref={editorRef} image={cleanBase} doc={doc} onChange={setDoc}
                selectedKey={selectedKey} onSelect={setSelectedKey} />
            )}
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8 }}>
              Kéo thả từng lớp chữ để dời/đổi cỡ · nét đứt = vùng an toàn · <span style={{ fontFamily: "var(--font-mono)" }}>xuất theo độ phân giải ảnh gốc</span>
            </div>
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 300 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {pack ? <Badge tone="success" dot>Style bìa từ sách gốc</Badge> : <Badge tone="neutral">Chưa có style bìa gốc</Badge>}
              {pack?.palettes?.[0] && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {(["background", "primary", "secondary", "accent"] as const).map((k) => {
                    const c = pack.palettes![0][k];
                    return c ? <span key={k} title={`${k}: ${c}`} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid var(--border)" }} /> : null;
                  })}
                </div>
              )}
            </div>
            {doc && <CoverElementPanel doc={doc} selectedKey={selectedKey} onSelect={setSelectedKey} onPatch={patchEl} />}
            <div style={{ marginTop: 12 }}>
              <Button variant="outline" size="sm" onClick={doReextract} disabled={reBusy || !coverDesign.enabled || !cleanBase}>
                <Icon name="sparkles" size={15} /> {reBusy ? "Đang trích…" : "Trích lại style từ bìa"}
              </Button>
            </div>
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
                <Button disabled={!genCover.enabled || aiBusy} onClick={doGenAi} style={{ width: "100%" }}><Icon name="sparkles" size={18} /> {aiBusy ? "Đang gen…" : "Gen 3 phương án"}</Button>
                {!genCover.enabled && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Gen AI cần bật ghi thật (staging) + backend.</div>}
                {aiErr && <div style={{ fontSize: 12, color: "var(--danger)" }}>{aiErr}</div>}
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
                {["A", "B", "C"].map((v, i) => {
                  const r = aiResults[i];
                  return (
                    <div key={v}>
                      <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", border: r ? "1px solid var(--border)" : "1px dashed var(--neutral-300)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", background: "var(--neutral-100)" }}>
                        {r ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.previewUrl} alt={`Phương án ${v}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <Icon name="sparkles" size={20} />
                        )}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", marginTop: 6 }}>Phương án {v}</div>
                      {r && (
                        <Button size="sm" style={{ width: "100%", marginTop: 6 }} disabled={busy !== null || !saveCover.enabled} onClick={() => applyAiCover(r.base64)}>
                          {busy === "save" ? "Đang lưu…" : "Lưu làm bìa"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 12 }}>Bấm “Gen 3 phương án” để tạo bìa mới từ tiêu đề + trang màu (dùng backend AI). Prompt bổ sung được ghép vào tiêu đề.</div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
