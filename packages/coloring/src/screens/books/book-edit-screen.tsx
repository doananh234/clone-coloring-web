"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Select, Switch } from "../../components/ui/form-controls";
import { TagsInput } from "../../components/ui/tags-input";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useBook } from "../../data/use-book";
import { useSaveBook } from "../../data/use-write";
import { useBookAi } from "../../data/use-more-actions";
import { useEntityList } from "../../data/use-entity-list";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import type { BookPatch } from "../../data/local-books";
import type { BookSpecifications, BookEtsyListing } from "../../data/types";

const BADGES = ["", "New", "Bestseller", "Sale", "Popular", "Limited"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="mo-flabel">{label}</span>
      {children}
    </label>
  );
}

function Area({ value, onChange, min = 96 }: { value: string; onChange: (v: string) => void; min?: number }) {
  return (
    <textarea
      className="mo-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minHeight: min, padding: 12, resize: "vertical", lineHeight: 1.55 }}
    />
  );
}

/** Native color picker + free-text (hex or CSS color name). */
function ColorInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value ?? "") ? (value as string) : "#ffffff";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 40, height: 34, padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer", flexShrink: 0 }}
      />
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="#RRGGBB hoặc tên màu" />
    </div>
  );
}

const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 } as const;
const grid3 = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16 } as const;

export function BookEditScreen({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { book, isLoading, isError } = useBook(bookId);
  const saveBook = useSaveBook(bookId);
  const bookAi = useBookAi(bookId);
  const { items: categories } = useEntityList("categories");
  const [form, setForm] = useState<BookPatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [metaGen, setMetaGen] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (book && form === null) {
      const d = (book.data ?? {}) as Record<string, unknown>;
      const asStr = (v: unknown) => (typeof v === "string" ? v : "");
      setForm({
        // columns
        title: book.title ?? "",
        subtitle: book.subtitle ?? "",
        description: book.description ?? "",
        price: book.price ?? "",
        originalPrice: book.originalPrice ?? "",
        discount: book.discount ?? "",
        category: book.category ?? "",
        categoryId: book.categoryId ?? "",
        badge: book.badge ?? "",
        backgroundColor: book.backgroundColor ?? "",
        tryoutPage: book.tryoutPage ?? "",
        coverUrl: book.coverUrl ?? "",
        pdfUrl: book.pdfUrl ?? "",
        thumbnailUrl: book.thumbnailUrl ?? "",
        squareThumbnailUrl: book.squareThumbnailUrl ?? "",
        niche: book.niche ?? "",
        isPublic: book.isPublic ?? false,
        // data blob
        isPremium: book.isPremium ?? Boolean(d.isPremium),
        isConverted: Boolean(d.isConverted),
        isRedesigned: Boolean(d.isRedesigned),
        isEditionConverted: Boolean(d.isEditionConverted),
        tags: (book.tags ?? (d.tags as string[] | undefined) ?? []) as string[],
        primaryColor: asStr(d.primaryColor),
        secondaryColor: asStr(d.secondaryColor),
        themeStyle: asStr(d.themeStyle),
        holiday: asStr(d.holiday),
        occasion: asStr(d.occasion),
        specifications: (book.specifications ?? (d.specifications as BookSpecifications | undefined) ?? {}) as BookSpecifications,
        etsyListing: ((d.etsyListing as BookEtsyListing | undefined) ?? {}) as BookEtsyListing,
      });
    }
  }, [book, form]);

  const catOptions = useMemo(
    () => categories.map((c) => ({ label: c.displayName || c.name, value: c.id })),
    [categories],
  );

  if (isLoading || (!form && !isError)) return <Card><LoadingRows rows={6} /></Card>;
  if (isError || !book || !form) {
    return (
      <Card>
        <ErrorState sub={`Không tải được sách ${bookId}.`} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outline" size="sm" onClick={() => router.push(`${B}/books`)}>Về thư viện</Button>
        </div>
      </Card>
    );
  }

  const f = form;
  const set = <K extends keyof BookPatch>(k: K, v: BookPatch[K]) => setForm((s) => ({ ...s, [k]: v }));
  const setSpec = <K extends keyof BookSpecifications>(k: K, v: BookSpecifications[K]) =>
    setForm((s) => ({ ...s, specifications: { ...(s?.specifications ?? {}), [k]: v } }));
  const setEtsy = <K extends keyof BookEtsyListing>(k: K, v: BookEtsyListing[K]) =>
    setForm((s) => ({ ...s, etsyListing: { ...(s?.etsyListing ?? {}), [k]: v } }));

  // Merge a preview-confirmed meta patch into the form (deep-merges spec + etsy).
  const applyMetaPatch = (p: MetaApplyPatch) => {
    setForm((s) => ({
      ...(s ?? {}),
      ...p.top,
      specifications: { ...(s?.specifications ?? {}), ...p.spec },
      etsyListing: { ...(s?.etsyListing ?? {}), ...p.etsy },
    }));
  };

  const spec = f.specifications ?? {};
  const etsy = f.etsyListing ?? {};

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await saveBook(f);
      router.push(`${B}/books/${bookId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lưu thất bại");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push(`${B}/books/${bookId}`)}>
          <Icon name="arrow-left" size={16} /> Chi tiết sách
        </Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Sửa thông tin sách</h1>
        {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Ghi API thật</Badge> : <Badge tone="warning">Lưu local · không đụng data thật</Badge>}
      </div>

      <Card title="Thông tin cơ bản">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Field label="Tiêu đề"><Input value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Phụ đề"><Input value={f.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} /></Field>
          <Field label="Mô tả"><Area value={f.description ?? ""} onChange={(v) => set("description", v)} /></Field>
          <div style={grid2}>
            <Select
              label="Danh mục"
              value={f.categoryId ?? ""}
              onChange={(v) => {
                const cat = categories.find((c) => c.id === v);
                set("categoryId", v);
                set("category", cat?.name || cat?.displayName || "");
              }}
              options={catOptions}
              placeholder={f.category ? `Hiện tại: ${f.category}` : "Chọn danh mục"}
            />
            <Select label="Badge" value={f.badge ?? ""} onChange={(v) => set("badge", v)} options={BADGES.map((x) => ({ label: x || "— Không —", value: x }))} />
          </div>
        </div>
      </Card>

      <Card title="Giá">
        <div style={grid3}>
          <Field label="Giá bán"><Input value={f.price ?? ""} onChange={(e) => set("price", e.target.value)} placeholder="$6.99" /></Field>
          <Field label="Giá gốc"><Input value={f.originalPrice ?? ""} onChange={(e) => set("originalPrice", e.target.value)} placeholder="$9.99" /></Field>
          <Field label="Giảm giá"><Input value={f.discount ?? ""} onChange={(e) => set("discount", e.target.value)} placeholder="30%" /></Field>
        </div>
      </Card>

      <Card title="Ảnh & file">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Cover URL"><Input value={f.coverUrl ?? ""} onChange={(e) => set("coverUrl", e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} /></Field>
          <div style={grid2}>
            <Field label="Thumbnail 3:4"><Input value={f.thumbnailUrl ?? ""} onChange={(e) => set("thumbnailUrl", e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} /></Field>
            <Field label="Thumbnail 1:1"><Input value={f.squareThumbnailUrl ?? ""} onChange={(e) => set("squareThumbnailUrl", e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} /></Field>
          </div>
          <div style={grid2}>
            <Field label="PDF URL"><Input value={f.pdfUrl ?? ""} onChange={(e) => set("pdfUrl", e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} /></Field>
            <Field label="Trang dùng thử (tryout)"><Input value={f.tryoutPage ?? ""} onChange={(e) => set("tryoutPage", e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} /></Field>
          </div>
        </div>
      </Card>

      <Card title="Khám phá & giao diện">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Tags / keywords">
            <TagsInput value={f.tags ?? []} onChange={(t) => set("tags", t)} />
          </Field>
          <div style={grid3}>
            <Field label="Theme style"><Input value={f.themeStyle ?? ""} onChange={(e) => set("themeStyle", e.target.value)} placeholder="cozy, whimsical…" /></Field>
            <Field label="Holiday"><Input value={f.holiday ?? ""} onChange={(e) => set("holiday", e.target.value)} /></Field>
            <Field label="Occasion"><Input value={f.occasion ?? ""} onChange={(e) => set("occasion", e.target.value)} /></Field>
          </div>
          <div style={grid3}>
            <Field label="Màu nền (background)"><ColorInput value={f.backgroundColor ?? ""} onChange={(v) => set("backgroundColor", v)} /></Field>
            <Field label="Màu chính"><ColorInput value={f.primaryColor ?? ""} onChange={(v) => set("primaryColor", v)} /></Field>
            <Field label="Màu phụ"><ColorInput value={f.secondaryColor ?? ""} onChange={(v) => set("secondaryColor", v)} /></Field>
          </div>
        </div>
      </Card>

      <Card title="Thông số">
        <div style={grid3}>
          <Field label="Số trang">
            <Input type="number" value={spec.pages != null ? String(spec.pages) : ""} onChange={(e) => setSpec("pages", e.target.value === "" ? undefined : Number(e.target.value))} />
          </Field>
          <Field label="Kích thước"><Input value={spec.dimensions ?? ""} onChange={(e) => setSpec("dimensions", e.target.value)} placeholder='8.5" x 11"' /></Field>
          <Field label="Độ tuổi"><Input value={spec.ageRange ?? ""} onChange={(e) => setSpec("ageRange", e.target.value)} placeholder="4-8" /></Field>
        </div>
      </Card>

      <Card title="Etsy listing">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Etsy title"><Input value={etsy.etsyTitle ?? ""} onChange={(e) => setEtsy("etsyTitle", e.target.value)} /></Field>
          <Field label="Etsy description"><Area value={etsy.etsyDescription ?? ""} onChange={(v) => setEtsy("etsyDescription", v)} min={120} /></Field>
          <Field label="Materials (phân cách bằng dấu phẩy)">
            <Input
              value={(etsy.materials ?? []).join(", ")}
              onChange={(e) => setEtsy("materials", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            />
          </Field>
          <div style={grid2}>
            <Field label="Etsy category"><Input value={etsy.etsyCategory ?? ""} onChange={(e) => setEtsy("etsyCategory", e.target.value)} /></Field>
            <Field label="Subcategory"><Input value={etsy.subcategory ?? ""} onChange={(e) => setEtsy("subcategory", e.target.value)} /></Field>
          </div>
          <div style={grid3}>
            <Field label="Giá gợi ý (USD)">
              <Input type="number" step="0.01" value={etsy.priceSuggestionUsd != null ? String(etsy.priceSuggestionUsd) : ""} onChange={(e) => setEtsy("priceSuggestionUsd", e.target.value === "" ? undefined : Number(e.target.value))} />
            </Field>
            <Field label="Ghi chú giá"><Input value={etsy.priceNotes ?? ""} onChange={(e) => setEtsy("priceNotes", e.target.value)} /></Field>
            <Field label="Section"><Input value={etsy.section ?? ""} onChange={(e) => setEtsy("section", e.target.value)} /></Field>
          </div>
        </div>
      </Card>

      <Card title="Cài đặt">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Switch label="Công khai (Public)" checked={!!f.isPublic} onChange={(v) => set("isPublic", v)} />
          <Switch label="Premium" checked={!!f.isPremium} onChange={(v) => set("isPremium", v)} />
          <Switch label="Đã convert (isConverted)" checked={!!f.isConverted} onChange={(v) => set("isConverted", v)} />
          <Switch label="Đã redesign (isRedesigned)" checked={!!f.isRedesigned} onChange={(v) => set("isRedesigned", v)} />
          <Switch label="Đã convert edition (isEditionConverted)" checked={!!f.isEditionConverted} onChange={(v) => set("isEditionConverted", v)} />
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <Field label="Niche"><Input value={f.niche ?? ""} onChange={(e) => set("niche", e.target.value)} /></Field>
          </div>
        </div>
      </Card>

      {err && (
        <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>
      )}
      {okMsg && (
        <div style={{ padding: "10px 12px", background: "var(--success-bg)", color: "var(--success)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{okMsg}</div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <Button variant="outline" disabled={!bookAi.enabled || genning || saving} title={bookAi.enabled ? undefined : "Cần bật ghi thật (staging)"}
          onClick={async () => {
            setGenning(true); setErr(null); setOkMsg(null);
            try {
              const data = await bookAi.genMeta(book.squareThumbnailUrl || book.coverUrl || undefined);
              setMetaGen(data); // open preview modal — nothing is overwritten until confirmed
            } catch (e) { setErr(e instanceof Error ? e.message : "Sinh meta thất bại"); }
            finally { setGenning(false); }
          }}>
          <Icon name="sparkles" size={16} /> {genning ? "Đang sinh…" : "Sinh meta AI"}
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => router.push(`${B}/books/${bookId}`)}>Hủy</Button>
        <Button onClick={save} disabled={saving}>
          <Icon name="check" size={18} /> {saving ? "Đang lưu…" : COLORING_WRITE_ENABLED ? "Lưu" : "Lưu (local)"}
        </Button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        {COLORING_WRITE_ENABLED
          ? "Ghi thật qua PUT /api/books/[id]. Column → cột thật; các trường khác (specifications, etsy, colors, flags…) merge vào Book.data không phá dữ liệu cũ."
          : "Lưu local (localStorage), hiển thị chồng lên bản thật. Bật NEXT_PUBLIC_COLORING_WRITE=1 để ghi thật."}
      </div>

      {metaGen && (
        <MetaPreviewModal
          generated={metaGen}
          current={f}
          onApply={(p, n) => {
            applyMetaPatch(p);
            setMetaGen(null);
            setOkMsg(`Đã áp ${n} trường meta AI vào form (kiểm tra rồi bấm Lưu).`);
          }}
          onClose={() => setMetaGen(null)}
        />
      )}
    </div>
  );
}

// --- AI meta preview / confirm ---------------------------------------------

type MetaSection = "basic" | "discovery" | "etsy";
type MetaTarget = "top" | "spec" | "etsy";
interface MetaDef {
  key: string;
  label: string;
  section: MetaSection;
  target: MetaTarget;
  /** Where to read the generated value from. */
  genFrom: "root" | "etsy";
  genKey: string;
  /** Field name inside its target object. */
  formKey: string;
  isNum?: boolean;
  isArr?: boolean;
}

const META_DEFS: MetaDef[] = [
  { key: "title", label: "Tiêu đề", section: "basic", target: "top", genFrom: "root", genKey: "title", formKey: "title" },
  { key: "subtitle", label: "Phụ đề", section: "basic", target: "top", genFrom: "root", genKey: "subtitle", formKey: "subtitle" },
  { key: "description", label: "Mô tả", section: "basic", target: "top", genFrom: "root", genKey: "description", formKey: "description" },
  { key: "badge", label: "Badge", section: "basic", target: "top", genFrom: "root", genKey: "badge", formKey: "badge" },
  { key: "categoryId", label: "Danh mục (ID)", section: "basic", target: "top", genFrom: "root", genKey: "categoryId", formKey: "categoryId" },
  { key: "category", label: "Danh mục", section: "basic", target: "top", genFrom: "root", genKey: "category", formKey: "category" },
  { key: "price", label: "Giá", section: "basic", target: "top", genFrom: "root", genKey: "price", formKey: "price" },
  { key: "ageRange", label: "Độ tuổi", section: "basic", target: "spec", genFrom: "root", genKey: "ageRange", formKey: "ageRange" },
  { key: "dimensions", label: "Kích thước", section: "basic", target: "spec", genFrom: "root", genKey: "dimensions", formKey: "dimensions" },
  { key: "backgroundColor", label: "Màu nền", section: "basic", target: "top", genFrom: "root", genKey: "backgroundColor", formKey: "backgroundColor" },
  { key: "tags", label: "Tags", section: "discovery", target: "top", genFrom: "root", genKey: "tags", formKey: "tags", isArr: true },
  { key: "primaryColor", label: "Màu chính", section: "discovery", target: "top", genFrom: "root", genKey: "primaryColor", formKey: "primaryColor" },
  { key: "secondaryColor", label: "Màu phụ", section: "discovery", target: "top", genFrom: "root", genKey: "secondaryColor", formKey: "secondaryColor" },
  { key: "themeStyle", label: "Theme style", section: "discovery", target: "top", genFrom: "root", genKey: "themeStyle", formKey: "themeStyle" },
  { key: "holiday", label: "Holiday", section: "discovery", target: "top", genFrom: "root", genKey: "holiday", formKey: "holiday" },
  { key: "occasion", label: "Occasion", section: "discovery", target: "top", genFrom: "root", genKey: "occasion", formKey: "occasion" },
  { key: "etsyTitle", label: "Etsy title", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "etsyTitle", formKey: "etsyTitle" },
  { key: "etsyDescription", label: "Etsy description", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "etsyDescription", formKey: "etsyDescription" },
  { key: "materials", label: "Materials", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "materials", formKey: "materials", isArr: true },
  { key: "etsyCategory", label: "Etsy category", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "etsyCategory", formKey: "etsyCategory" },
  { key: "subcategory", label: "Subcategory", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "subcategory", formKey: "subcategory" },
  { key: "priceSuggestionUsd", label: "Giá gợi ý (USD)", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "priceSuggestionUsd", formKey: "priceSuggestionUsd", isNum: true },
  { key: "priceNotes", label: "Ghi chú giá", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "priceNotes", formKey: "priceNotes" },
  { key: "section", label: "Section", section: "etsy", target: "etsy", genFrom: "etsy", genKey: "section", formKey: "section" },
];

const SECTION_LABELS: Record<MetaSection, string> = { basic: "Cơ bản", discovery: "Khám phá", etsy: "Etsy" };

export interface MetaApplyPatch {
  top: Partial<BookPatch>;
  spec: Partial<BookSpecifications>;
  etsy: Partial<BookEtsyListing>;
}

function genValueOf(def: MetaDef, generated: Record<string, unknown>): unknown {
  const root = def.genFrom === "etsy" ? ((generated.etsyListing ?? {}) as Record<string, unknown>) : generated;
  return root[def.genKey];
}
function curValueOf(def: MetaDef, current: BookPatch): unknown {
  if (def.target === "spec") return (current.specifications ?? {})[def.formKey as keyof BookSpecifications];
  if (def.target === "etsy") return (current.etsyListing ?? {})[def.formKey as keyof BookEtsyListing];
  return (current as Record<string, unknown>)[def.formKey];
}
function fmtMeta(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
/** A generated value is "present" (worth applying) when non-empty. */
function hasGen(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function MetaPreviewModal({
  generated,
  current,
  onApply,
  onClose,
}: {
  generated: Record<string, unknown>;
  current: BookPatch;
  onApply: (patch: MetaApplyPatch, count: number) => void;
  onClose: () => void;
}) {
  const entries = META_DEFS.map((def) => {
    const gen = genValueOf(def, generated);
    const cur = curValueOf(def, current);
    return { def, gen, cur, present: hasGen(gen), changed: hasGen(gen) && fmtMeta(gen) !== fmtMeta(cur) };
  });
  // Default: select fields the AI returned that differ from current.
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(entries.map((e) => [e.def.key, e.changed])),
  );
  const toggle = (k: string) => setPicked((p) => ({ ...p, [k]: !p[k] }));
  const setAll = (v: boolean) =>
    setPicked(Object.fromEntries(entries.filter((e) => e.present).map((e) => [e.def.key, v])));

  const pickedCount = entries.filter((e) => picked[e.def.key] && e.present).length;

  const apply = () => {
    const patch: MetaApplyPatch = { top: {}, spec: {}, etsy: {} };
    for (const e of entries) {
      if (!picked[e.def.key] || !e.present) continue;
      const { def, gen } = e;
      const value = def.isArr ? (gen as string[]) : def.isNum ? (gen as number) : String(gen);
      if (def.target === "spec") (patch.spec as Record<string, unknown>)[def.formKey] = value;
      else if (def.target === "etsy") (patch.etsy as Record<string, unknown>)[def.formKey] = value;
      else (patch.top as Record<string, unknown>)[def.formKey] = value;
    }
    onApply(patch, pickedCount);
  };

  const sections: MetaSection[] = ["basic", "discovery", "etsy"];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", width: "min(760px,100%)", maxHeight: "88vh", overflow: "auto", animation: "mo-dd-in var(--dur-med) var(--ease-out)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--card)", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="sparkles" size={18} />
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>Meta AI — xem trước ({pickedCount} chọn)</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setAll(true)}>Chọn hết</Button>
            <Button variant="ghost" size="sm" onClick={() => setAll(false)}>Bỏ hết</Button>
            <button type="button" className="mo-hbtn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button>
          </div>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Tick trường muốn ghi đè. Chưa lưu — bấm “Áp dụng” rồi “Lưu” mới ghi thật.</div>
          {sections.map((sec) => {
            const rows = entries.filter((e) => e.def.section === sec);
            return (
              <div key={sec} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted-foreground)" }}>{SECTION_LABELS[sec]}</div>
                {rows.map((e) => (
                  <div key={e.def.key} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10, opacity: e.present ? 1 : 0.45 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: e.present ? "pointer" : "default" }}>
                      <input type="checkbox" checked={!!picked[e.def.key] && e.present} disabled={!e.present} onChange={() => toggle(e.def.key)} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{e.def.label}</span>
                      {!e.present && <Badge tone="neutral">AI không trả</Badge>}
                      {e.present && !e.changed && <Badge tone="neutral">Giống hiện tại</Badge>}
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12.5 }}>
                      <div>
                        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted-foreground)", marginBottom: 3 }}>Hiện tại</div>
                        <div style={{ whiteSpace: "pre-wrap", color: "var(--muted-foreground)", wordBreak: "break-word" }}>{fmtMeta(e.cur)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--volt-700)", marginBottom: 3 }}>AI đề xuất</div>
                        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{fmtMeta(e.gen)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px", borderTop: "1px solid var(--border)", position: "sticky", bottom: 0, background: "var(--card)" }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Hủy</Button>
          <Button size="sm" onClick={apply} disabled={pickedCount === 0}>
            <Icon name="check" size={16} /> Áp dụng {pickedCount > 0 ? `(${pickedCount})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
