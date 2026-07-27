"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Stepper } from "../../components/ui/stepper";
import { Select } from "../../components/ui/form-controls";
import { StylePicker, type StylePickerItem } from "../../components/ui/style-picker";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { useCreateEntity } from "../../data/use-create-entity";
import { useEntityList } from "../../data/use-entity-list";
import { resolveImg } from "../../data/img";

function toStyleItems(list: { id: string; name: string; thumbnailUrl?: string | null; referenceImageUrl?: string | null }[]): StylePickerItem[] {
  return list.map((s) => ({ id: s.id, name: s.name, image: resolveImg(s.thumbnailUrl || s.referenceImageUrl || undefined) }));
}

const CATEGORIES = ["Animals", "Fantasy", "Vehicles", "Nature", "Holidays"];
const STEPS = [{ label: "Thông tin" }, { label: "Phong cách" }, { label: "Xác nhận" }];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="mo-flabel">{label}</span>
      {children}
    </label>
  );
}
function Review({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 600 }}>{value || "—"}</span>
    </div>
  );
}

export function BookCreateScreen() {
  const router = useRouter();
  const svc = useCreateEntity("books");
  const { items: bwStyles } = useEntityList("art-styles");
  const { items: colorStyles } = useEntityList("coloring-styles");

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [bwStyleId, setBwStyleId] = useState("");
  const [colorStyleId, setColorStyleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bwOpts = bwStyles.map((s) => ({ label: s.name, value: s.id }));
  const colorOpts = colorStyles.map((s) => ({ label: s.name, value: s.id }));
  const bwItems = toStyleItems(bwStyles);
  const colorItems = toStyleItems(colorStyles);
  const canNext0 = title.trim().length > 0;

  const create = async () => {
    setSaving(true);
    setErr(null);
    try {
      const { id } = await svc.create({
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        description: description.trim() || undefined,
        price: price.trim() || undefined,
        category,
        coverUrl: "",
        coloringPages: [],
        data: { bwStyleId: bwStyleId || undefined, coloringStyleId: colorStyleId || undefined },
      });
      router.push(id ? `${B}/books/${id}` : `${B}/books`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tạo sách thất bại");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push(`${B}/books`)}>
          <Icon name="arrow-left" size={16} /> Sách
        </Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Tạo sách mới</h1>
        {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Ghi API thật</Badge> : <Badge tone="warning">Cần bật ghi thật</Badge>}
      </div>

      <Card><Stepper steps={STEPS} current={step} onStepClick={setStep} /></Card>

      {step === 0 && (
        <Card title="Thông tin cơ bản">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Tiêu đề"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Dino Friends Adventures" /></Field>
            <Field label="Phụ đề"><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></Field>
            <Field label="Mô tả">
              <textarea className="mo-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 88, padding: 12, resize: "vertical", lineHeight: 1.55 }} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
              <Field label="Giá"><Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$6.99" /></Field>
              <Select label="Danh mục" value={category} onChange={setCategory} options={CATEGORIES} />
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="Phong cách">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div className="mo-flabel" style={{ marginBottom: 8 }}>B&amp;W style (tuỳ chọn)</div>
              <StylePicker items={bwItems} value={bwStyleId} onChange={setBwStyleId} clearable emptyText="Chưa có art-style." />
            </div>
            <div>
              <div className="mo-flabel" style={{ marginBottom: 8 }}>Coloring style (tuỳ chọn)</div>
              <StylePicker items={colorItems} value={colorStyleId} onChange={setColorStyleId} clearable emptyText="Chưa có coloring-style." />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Trang tô màu sẽ thêm sau qua clone job / tô màu AI.</div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Xác nhận & tạo sách">
          <Review label="Tiêu đề" value={title} />
          <Review label="Phụ đề" value={subtitle} />
          <Review label="Danh mục" value={category} />
          <Review label="Giá" value={price} />
          <Review label="B&W style" value={bwOpts.find((o) => o.value === bwStyleId)?.label} />
          <Review label="Coloring style" value={colorOpts.find((o) => o.value === colorStyleId)?.label} />
          {err && <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted-foreground)" }}>
            {COLORING_WRITE_ENABLED ? "Ghi thật qua POST /api/books. Đảm bảo upstream trỏ staging." : "Cần bật NEXT_PUBLIC_COLORING_WRITE=1 (staging) để tạo sách thật."}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <Button variant="ghost" onClick={() => (step === 0 ? router.push(`${B}/books`) : setStep(step - 1))}>{step === 0 ? "Hủy" : "Quay lại"}</Button>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !canNext0}>Tiếp tục <Icon name="chevron-right" size={16} /></Button>
        ) : (
          <Button onClick={create} disabled={saving || !svc.enabled}><Icon name="plus" size={18} /> {saving ? "Đang tạo…" : "Tạo sách"}</Button>
        )}
      </div>
    </div>
  );
}
