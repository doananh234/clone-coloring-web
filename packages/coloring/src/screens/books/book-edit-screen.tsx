"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Select, Switch } from "../../components/ui/form-controls";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useBook } from "../../data/use-book";
import { useSaveBook } from "../../data/use-write";
import { useBookAi } from "../../data/use-more-actions";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import type { BookPatch } from "../../data/local-books";

const CATEGORIES = ["Animals", "Fantasy", "Vehicles", "Nature", "Holidays"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="mo-flabel">{label}</span>
      {children}
    </label>
  );
}

export function BookEditScreen({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { book, isLoading, isError } = useBook(bookId);
  const saveBook = useSaveBook(bookId);
  const bookAi = useBookAi(bookId);
  const [form, setForm] = useState<BookPatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [metaPreview, setMetaPreview] = useState<{ title?: string; subtitle?: string; description?: string } | null>(null);

  useEffect(() => {
    if (book && form === null) {
      setForm({
        title: book.title ?? "",
        subtitle: book.subtitle ?? "",
        description: book.description ?? "",
        price: book.price ?? "",
        category: book.category ?? "",
        isPublic: book.isPublic ?? false,
        isPremium: book.isPremium ?? false,
      });
    }
  }, [book, form]);

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

  const set = <K extends keyof BookPatch>(k: K, v: BookPatch[K]) => setForm((f) => ({ ...f, [k]: v }));
  const catOptions = form.category && !CATEGORIES.includes(form.category) ? [form.category, ...CATEGORIES] : CATEGORIES;

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await saveBook(form);
      router.push(`${B}/books/${bookId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lưu thất bại");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
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
          <Field label="Tiêu đề">
            <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Phụ đề">
            <Input value={form.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
          </Field>
          <Field label="Mô tả">
            <textarea
              className="mo-input"
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              style={{ minHeight: 96, padding: 12, resize: "vertical", lineHeight: 1.55 }}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            <Field label="Giá">
              <Input value={form.price ?? ""} onChange={(e) => set("price", e.target.value)} placeholder="$6.99" />
            </Field>
            <Select label="Danh mục" value={form.category ?? ""} onChange={(v) => set("category", v)} options={catOptions} placeholder="Chọn danh mục" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <Switch label="Công khai (Public)" checked={!!form.isPublic} onChange={(v) => set("isPublic", v)} />
            <Switch label="Premium" checked={!!form.isPremium} onChange={(v) => set("isPremium", v)} />
          </div>

          {err && (
            <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <Button variant="outline" disabled={!bookAi.enabled || genning || saving} title={bookAi.enabled ? undefined : "Cần bật ghi thật (staging)"}
              onClick={async () => {
                setGenning(true); setErr(null);
                try {
                  const data = await bookAi.genMeta(book.squareThumbnailUrl || book.coverUrl || undefined);
                  // Preview before applying — don't silently overwrite the user's edits.
                  setMetaPreview({ title: data.title as string | undefined, subtitle: data.subtitle as string | undefined, description: data.description as string | undefined });
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
              ? "Ghi thật qua PUT /api/books/[id] (chỉ các column hợp lệ). Đảm bảo upstream trỏ staging."
              : "Lưu local (localStorage), hiển thị chồng lên bản thật. Map sẵn PUT /api/books/[id] — bật NEXT_PUBLIC_COLORING_WRITE=1 để ghi thật."}
          </div>
        </div>
      </Card>

      {metaPreview && (
        <MetaPreviewModal
          preview={metaPreview}
          current={{ title: form.title ?? undefined, subtitle: form.subtitle ?? undefined, description: form.description ?? undefined }}
          onApply={(picked) => {
            setForm((f) => ({ ...(f ?? {}), ...picked }));
            setMetaPreview(null);
          }}
          onClose={() => setMetaPreview(null)}
        />
      )}
    </div>
  );
}

const META_FIELDS: { key: "title" | "subtitle" | "description"; label: string }[] = [
  { key: "title", label: "Tiêu đề" },
  { key: "subtitle", label: "Phụ đề" },
  { key: "description", label: "Mô tả" },
];

/** Preview AI-generated metadata vs current values; user picks which fields to apply. */
function MetaPreviewModal({
  preview, current, onApply, onClose,
}: {
  preview: { title?: string; subtitle?: string; description?: string };
  current: { title?: string; subtitle?: string; description?: string };
  onApply: (picked: { title?: string; subtitle?: string; description?: string }) => void;
  onClose: () => void;
}) {
  // Fields that have a generated value and differ from current start selected.
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(META_FIELDS.map((f) => [f.key, !!preview[f.key] && preview[f.key] !== current[f.key]])),
  );

  const apply = () => {
    const out: { title?: string; subtitle?: string; description?: string } = {};
    for (const f of META_FIELDS) if (picked[f.key] && preview[f.key] != null) out[f.key] = preview[f.key];
    onApply(out);
  };
  const anyPicked = META_FIELDS.some((f) => picked[f.key]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", width: "min(640px,100%)", maxHeight: "88vh", overflow: "auto", animation: "mo-dd-in var(--dur-med) var(--ease-out)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="sparkles" size={18} />
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>Meta AI — xem trước</h3>
          </div>
          <button type="button" className="mo-hbtn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Chọn trường muốn áp dụng. Chưa lưu — bấm “Lưu” sau khi áp dụng để ghi.</div>
          {META_FIELDS.map((f) => {
            const gen = preview[f.key];
            const cur = current[f.key];
            const changed = !!gen && gen !== cur;
            return (
              <div key={f.key} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, opacity: gen ? 1 : 0.5 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: gen ? "pointer" : "default" }}>
                  <input type="checkbox" checked={!!picked[f.key]} disabled={!gen} onChange={(e) => setPicked((p) => ({ ...p, [f.key]: e.target.checked }))} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
                  {!gen && <Badge tone="neutral">AI không trả</Badge>}
                  {gen && !changed && <Badge tone="neutral">Giống hiện tại</Badge>}
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12.5 }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted-foreground)", marginBottom: 4 }}>Hiện tại</div>
                    <div style={{ whiteSpace: "pre-wrap", color: "var(--muted-foreground)" }}>{cur || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--volt-700)", marginBottom: 4 }}>AI đề xuất</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{gen || "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Hủy</Button>
          <Button size="sm" onClick={apply} disabled={!anyPicked}>
            <Icon name="check" size={16} /> Áp dụng
          </Button>
        </div>
      </div>
    </div>
  );
}
