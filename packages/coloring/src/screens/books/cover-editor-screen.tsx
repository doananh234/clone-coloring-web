"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs } from "../../components/ui/tabs";
import { Select } from "../../components/ui/form-controls";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useBook } from "../../data/use-book";
import { useEntityList } from "../../data/use-entity-list";
import { ColoringStylePickerModal, type StyleSelection } from "../../components/ui/coloring-style-picker-modal";
import type { SourceCover } from "../../data/source-covers";
import { useSaveCover, useGenerateCover, type GeneratedCover } from "../../data/use-cover-actions";
import { useCoverDesign, type CoverStylePack } from "../../data/use-cover-design";
import { useCoverTextOverlays } from "../../data/use-cover-text-overlays";
import { resolveImg, thumbImg } from "../../data/img";
import { CoverFabricEditor, type CoverEditorHandle } from "./cover-fabric-editor";
import { CoverElementPanel } from "./cover-element-panel";
import { defaultCoverDoc, normalizeCoverDoc, applyExtractedStyles, docToOverlayElements, type CoverDoc, type CoverElement, type CoverElementKey, type CoverElementStyleSeeds } from "../../lib/cover-doc";

const LAYOUT_OPTIONS = [
  { value: "top", label: "Tiêu đề trên" },
  { value: "center", label: "Tiêu đề giữa" },
  { value: "bottom", label: "Tiêu đề dưới" },
  { value: "corner", label: "Tiêu đề góc" },
];

export function CoverEditorScreen({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { book, isLoading, isError } = useBook(bookId);
  const { items: brands } = useEntityList("brands");
  const saveCover = useSaveCover(bookId);
  const genCover = useGenerateCover();
  const coverDesign = useCoverDesign();
  const overlays = useCoverTextOverlays();
  const [tab, setTab] = useState<"text" | "ai">("text");
  const editorRef = useRef<CoverEditorHandle>(null);
  const [doc, setDoc] = useState<CoverDoc | null>(null);
  const [selectedKey, setSelectedKey] = useState<CoverElementKey | null>("title");
  const [docLoaded, setDocLoaded] = useState(false);
  // Cover text-style extracted from the source cover (title/sub/brand fonts + colors).
  const [pack, setPack] = useState<CoverStylePack | null>(null);
  const [baseOverride, setBaseOverride] = useState<string | null>(null);
  const [reBusy, setReBusy] = useState(false);
  const [busy, setBusy] = useState<"save" | "export" | null>(null);
  const [msg, setMsg] = useState<{ err?: string; ok?: string } | null>(null);
  // AI tab
  const [prompt, setPrompt] = useState("");
  const [aiStyleSel, setAiStyleSel] = useState<StyleSelection | null>(null);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [aiBrandId, setAiBrandId] = useState("");
  const [aiLayout, setAiLayout] = useState("top");
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<GeneratedCover | null>(null);

  // Seed the cover doc once the book loads (badge = page count, seeded from the
  // pack auto-extracted at create-book time). Restores from book.data.coverLayout
  // when present so edits persist across reloads.
  useEffect(() => {
    if (!book || docLoaded) return;
    const badge = book.specifications?.pages ? `${book.specifications.pages} trang tô màu` : "";
    const pack = (book.data?.coverStylePack ?? null) as CoverStylePack | null;
    // Brand content comes from the book, not from extraction (no book.brand field
    // on the type → read the loosely-typed data blob; empty when absent).
    const brand = typeof book.data?.brand === "string" ? book.data.brand : "";
    const seed = {
      title: book.title || "",
      subtitle: book.subtitle || "",
      brand,
      badge,
      titleFont: pack?.fontPairs?.[0]?.display,
      titleColor: pack?.palettes?.[0]?.primary,
      // Style + LAYOUT for all 4 roles, extracted from the source cover.
      elements: pack?.elements,
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
  // `baseOverride` lets the user pick a different page as the background via the
  // thumbnail strip below the canvas; it wins over the stored coverMeta source.
  const coverMeta = (book.data?.coverMeta ?? {}) as { sourceThumbnailUrl?: string };
  const fullCoverMeta = (book.data?.coverMeta ?? {}) as Record<string, unknown>;
  const activeBaseRaw = baseOverride
    || coverMeta.sourceThumbnailUrl || book.squareThumbnailUrl || book.thumbnailUrl || book.coverUrl || "";
  const cleanBase = resolveImg(activeBaseRaw);
  // Cover (with text) is only the "current" reference in the AI tab.
  const cover = resolveImg(book.coverUrl || book.squareThumbnailUrl || book.thumbnailUrl);
  // Generated source covers (title-safe top/middle/bottom) — the primary picks
  // for a cover base. Prefer the colorized version; keep a position label for the
  // thumbnail badge.
  const sourceCovers = (book.data?.sourceCovers ?? []) as SourceCover[];
  const SRC_POS_LABEL: Record<string, string> = { top: "Top", middle: "Giữa", bottom: "Dưới" };
  const srcCoverPos = new Map<string, string>();
  for (const s of sourceCovers) {
    const u = s.coloredUrl || s.url;
    if (u) srcCoverPos.set(u, SRC_POS_LABEL[s.titleSafe] ?? String(s.titleSafe));
  }
  // Candidate background images for the thumbnail strip: source covers FIRST, then
  // current cover sources + the book's colored pages (falls back to line art).
  const bgCandidates = [...new Set([
    ...sourceCovers.map((s) => s.coloredUrl || s.url),
    coverMeta.sourceThumbnailUrl, book.squareThumbnailUrl, book.thumbnailUrl,
    ...(book.coloringPages ?? []).map((p) => p.coloredUrl || p.url),
  ].filter((u): u is string => Boolean(u)))];

  // Apply the extracted pack: per-element STYLE + POSITION for all 4 roles from
  // pack.elements (keeps each element's text). Falls back to title font/color
  // from fontPairs/palettes when the model didn't return per-element extraction.
  const applyPackToDoc = (p: CoverStylePack) => {
    setDoc((d) => {
      if (!d) return d;
      if (p.elements) return applyExtractedStyles(d, p.elements);
      const f = p.fontPairs?.[0]?.display;
      const primary = p.palettes?.[0]?.primary;
      const titlePatch: Partial<CoverElement> = {
        ...(f ? { fontFamily: f } : {}),
        ...(primary && /^#[0-9a-fA-F]{6}$/.test(primary) ? { color: primary } : {}),
      };
      return { ...d, elements: { ...d.elements, title: { ...d.elements.title, ...titlePatch } } };
    });
  };

  // Re-run cover-design on the source cover and re-apply style+position to all 4 roles.
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

  // Apply a saved overlay (per-element STYLE + POSITION) onto the current doc.
  // Content stays; only style + position change.
  const applyOverlay = (elements: Record<string, unknown>) => {
    setDoc((d) => (d ? applyExtractedStyles(d, elements as CoverElementStyleSeeds) : d));
    setMsg({ ok: "Đã áp bố cục chữ đã lưu." });
  };

  // Save the CURRENT doc's per-element style + position as a reusable overlay.
  const saveOverlay = async () => {
    if (!doc) return;
    const name = window.prompt("Tên bố cục chữ (overlay):");
    if (!name || !name.trim()) return;
    setMsg(null);
    try {
      await overlays.create(name.trim(), docToOverlayElements(doc));
      setMsg({ ok: `Đã lưu bố cục "${name.trim()}".` });
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : "Lưu bố cục thất bại." });
    }
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
      if (activeBaseRaw) await saveCover.saveCoverSource(activeBaseRaw, fullCoverMeta);
      setMsg({ ok: "Đã lưu bìa (coverUrl + layout)." });
    } catch (e) { setMsg({ err: e instanceof Error ? e.message : "Lưu bìa thất bại." }); }
    finally { setBusy(null); }
  };

  // AI cover: generate ONE cover from the chosen illustration + title, steered by
  // the selected brand / coloring style / title layout.
  const doGenAi = async () => {
    setAiErr(null); setAiResult(null);
    const chosen = aiImage || cleanBase;
    if (!chosen) { setAiErr("Chọn 1 tranh để làm bìa."); return; }
    setAiBusy(true);
    try {
      const genTitle = `${book.title || "Coloring Book"}${prompt.trim() ? ` — ${prompt.trim()}` : ""}`;
      const brandRec = brands.find((b) => b.id === aiBrandId);
      const brandName =
        brandRec?.displayName || brandRec?.name ||
        (typeof book.data?.brand === "string" ? book.data.brand : undefined) || undefined;
      const styleName = aiStyleSel?.styleName || undefined;
      const out = await genCover.generate({
        title: genTitle,
        imageUrls: [chosen],
        brand: brandName,
        style: styleName,
        layout: aiLayout,
      });
      setAiResult(out);
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
            {bgCandidates.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Ảnh nền bìa — source cover (Top/Giữa/Dưới) hoặc trang để làm nền</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {bgCandidates.map((u) => {
                    const active = u === activeBaseRaw;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setBaseOverride(u)}
                        title={active ? "Đang dùng làm nền" : "Dùng ảnh này làm nền"}
                        style={{
                          position: "relative",
                          width: 64,
                          height: 64,
                          padding: 0,
                          borderRadius: "var(--radius-md)",
                          border: active ? "2px solid var(--volt-500)" : "1px solid var(--border)",
                          background: "var(--neutral-100)",
                          overflow: "hidden",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbImg(u, 128)} alt="Ảnh nền" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        {srcCoverPos.has(u) && (
                          <span style={{ position: "absolute", left: 2, bottom: 2, background: "var(--carbon-950, #0b0d0c)", color: "#fff", fontSize: 8.5, fontWeight: 700, padding: "1px 4px", borderRadius: 4, letterSpacing: ".02em" }}>{srcCoverPos.get(u)}</span>
                        )}
                        {active && (
                          <span style={{ position: "absolute", right: 2, top: 2, background: "var(--volt-500)", color: "#fff", borderRadius: 99, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon name="check" size={12} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Bố cục chữ (overlay)</div>
              <Select
                value=""
                placeholder={overlays.overlays.length ? "Chọn bố cục đã lưu…" : "Chưa có bố cục nào"}
                options={overlays.overlays.map((o) => ({ label: o.name, value: o.id }))}
                onChange={(id) => {
                  const o = overlays.overlays.find((x) => x.id === id);
                  if (o && doc) applyOverlay(o.elements);
                }}
              />
              <Button variant="outline" size="sm" onClick={saveOverlay} disabled={!doc || !overlays.enabled} title={overlays.enabled ? undefined : "Cần bật ghi thật (staging)"}>
                <Icon name="download" size={15} /> Lưu bố cục hiện tại
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <Card title="Cấu hình gen">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Select label="Bố cục bìa" value={aiLayout} onChange={setAiLayout} options={LAYOUT_OPTIONS} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Tranh làm bìa</div>
                  {bgCandidates.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {bgCandidates.map((u) => {
                        const resolved = resolveImg(u) || u;
                        const active = (aiImage || cleanBase) === resolved;
                        return (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setAiImage(resolved)}
                            title={active ? "Đang chọn" : "Dùng tranh này làm bìa"}
                            style={{ position: "relative", width: 64, height: 64, padding: 0, borderRadius: "var(--radius-md)", border: active ? "2px solid var(--volt-500)" : "1px solid var(--border)", background: "var(--neutral-100)", overflow: "hidden", cursor: "pointer", flexShrink: 0 }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbImg(u, 128)} alt="Tranh bìa" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            {active && (
                              <span style={{ position: "absolute", right: 2, top: 2, background: "var(--volt-500)", color: "#fff", borderRadius: 99, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Icon name="check" size={12} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Chưa có tranh để chọn.</div>
                  )}
                </div>
                <Select label="Brand" value={aiBrandId} onChange={setAiBrandId} options={brands.map((b) => ({ label: b.displayName || b.name, value: b.id }))} placeholder="Không có brand" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Coloring style</div>
                  <button
                    type="button"
                    onClick={() => setStylePickerOpen(true)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--neutral-100)", cursor: "pointer", textAlign: "left" }}
                  >
                    {aiStyleSel?.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={aiStyleSel.thumb} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--neutral-200, #eee)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", flexShrink: 0 }}><Icon name="palette" size={16} /></span>
                    )}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: aiStyleSel ? 600 : 400, color: aiStyleSel ? "var(--foreground)" : "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {aiStyleSel ? aiStyleSel.styleName : "Chọn coloring style…"}
                    </span>
                    <Icon name="chevron-down" size={16} />
                  </button>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Prompt bổ sung</div>
                  <textarea className="mo-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả thêm cho bìa (tuỳ chọn)…" style={{ minHeight: 60, padding: "12px 14px", lineHeight: 1.65, resize: "vertical" }} />
                </div>
                <Button disabled={!genCover.enabled || aiBusy} onClick={doGenAi} style={{ width: "100%" }}><Icon name="sparkles" size={18} /> {aiBusy ? "Đang gen…" : "Gen 1 phương án"}</Button>
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
                <div>
                  <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", border: aiResult ? "1px solid var(--border)" : "1px dashed var(--neutral-300)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", background: "var(--neutral-100)" }}>
                    {aiResult ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={aiResult.previewUrl} alt="Bìa AI" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name="sparkles" size={20} />
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", marginTop: 6 }}>Bìa AI</div>
                  {aiResult && (
                    <Button size="sm" style={{ width: "100%", marginTop: 6 }} disabled={busy !== null || !saveCover.enabled} onClick={() => applyAiCover(aiResult.base64)}>
                      {busy === "save" ? "Đang lưu…" : "Lưu làm bìa"}
                    </Button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 12 }}>Chọn bố cục, tranh, brand, style rồi bấm “Gen 1 phương án” để tạo bìa mới (backend AI). Prompt bổ sung ghép vào tiêu đề.</div>
            </Card>
          </div>
        </div>
      )}

      <ColoringStylePickerModal
        open={stylePickerOpen}
        onClose={() => setStylePickerOpen(false)}
        onSelect={(sel) => { setAiStyleSel(sel); setStylePickerOpen(false); }}
        referenceThumb={cleanBase}
      />
    </div>
  );
}
