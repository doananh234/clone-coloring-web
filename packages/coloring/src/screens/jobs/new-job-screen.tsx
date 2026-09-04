"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Stepper } from "../../components/ui/stepper";
import { Select, RadioGroup, Switch, FileUpload, type RadioOption } from "../../components/ui/form-controls";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useCreateJob } from "../../data/use-create-job";
import { useEntityList } from "../../data/use-entity-list";
import { COLORING_WRITE_ENABLED } from "../../data/config";

const REDESIGN: RadioOption[] = [
  { value: "r30", label: "Redesign 30% khác", sub: "Giữ bố cục và góc nhìn của trang gốc" },
  { value: "r30cam", label: "Redesign 30% + đổi góc camera", sub: "Khác biệt mạnh hơn, an toàn hơn về bản quyền" },
];
const MODE_LABEL: Record<string, string> = { r30: "30% khác", r30cam: "30% + đổi camera" };

const STEPS = [{ label: "Nguồn" }, { label: "Cấu hình" }, { label: "Xác nhận" }];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Review({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function NewJobScreen() {
  const router = useRouter();
  const createJob = useCreateJob();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [redesign, setRedesign] = useState("r30cam");
  const { items: brands } = useEntityList("brands");
  const [brandId, setBrandId] = useState("");
  const brandRec = brands.find((b) => b.id === brandId);
  const brandName = brandRec?.displayName || brandRec?.name || "";
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [extract, setExtract] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCsv = file?.name.toLowerCase().endsWith(".csv");
  // Step 1 requires a file in real-write mode; optional in local mode.
  const canNext0 = COLORING_WRITE_ENABLED ? Boolean(file) : true;

  const enqueue = async () => {
    setSaving(true);
    setErr(null);
    try {
      const name = file ? file.name.replace(/\.[^.]+$/, "") : "Job nháp";
      const { jobId, bulk } = await createJob({ file, name, brand: brandName || undefined, brandId: brandId || undefined, redesignMode: MODE_LABEL[redesign] });
      router.push(bulk || !jobId ? `${B}/jobs` : `${B}/jobs/${jobId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tạo job thất bại");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push(`${B}/jobs`)}>
            <Icon name="arrow-left" size={16} /> Clone jobs
          </Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Tạo clone job</h1>
          {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Ghi API thật</Badge> : <Badge tone="warning">Nháp · lưu local</Badge>}
        </div>
      </div>

      <Card>
        <Stepper steps={STEPS} current={step} onStepClick={setStep} />
      </Card>

      {/* STEP 1 — Nguồn */}
      {step === 0 && (
        <Card title="Nạp nguồn">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Bulk clone · CSV</div>
              <FileUpload accept=".csv" hint="Mỗi dòng: URL PDF nguồn, brand, chế độ redesign" onFile={setFile} />
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Tối đa 50 sách mỗi batch · <a href="#" style={{ textDecoration: "underline" }}>Tải CSV mẫu</a></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Single clone · PDF</div>
              <FileUpload accept=".pdf" hint="1 file PDF sách nguồn, tối đa 200 MB" onFile={setFile} />
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Pipeline tách trang tự động ở bước đầu tiên</div>
            </div>
          </div>
          {file && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <Icon name="file-text" size={16} /> <span style={{ fontFamily: "var(--font-mono)" }}>{file.name}</span>
              <Badge tone={isCsv ? "info" : "carbon"}>{isCsv ? "Bulk CSV" : "PDF đơn"}</Badge>
            </div>
          )}
        </Card>
      )}

      {/* STEP 2 — Cấu hình */}
      {step === 1 && (
        <Card title="Cấu hình pipeline">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <RadioGroup label="Chế độ redesign" value={redesign} onChange={setRedesign} options={REDESIGN} />
            <div style={{ maxWidth: 320 }}>
              <Select label="Brand đích" value={brandId} onChange={setBrandId} options={brands.map((b) => ({ label: b.displayName || b.name, value: b.id }))} placeholder="Chọn brand" />
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>B&W style theo hình clone; danh mục tự sinh từ meta AI.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Switch label="Tự động confirm tạo book (bỏ duyệt thủ công)" checked={autoConfirm} onChange={setAutoConfirm} />
              <Switch label="Extract nhân vật, story, location context sau khi tạo book" checked={extract} onChange={setExtract} />
            </div>
          </div>
        </Card>
      )}

      {/* STEP 3 — Xác nhận */}
      {step === 2 && (
        <Card title="Xác nhận & đưa vào hàng đợi">
          <Review label="Nguồn" value={file ? file.name : "—"} />
          <Review label="Loại" value={isCsv ? "Bulk CSV" : file ? "PDF đơn" : "—"} />
          <Review label="Chế độ redesign" value={REDESIGN.find((r) => r.value === redesign)?.label} />
          <Review label="Brand đích" value={brandName || "—"} />
          <Review label="Tự động confirm" value={autoConfirm ? "Có" : "Không"} />
          <Review label="Extract sau tạo book" value={extract ? "Có" : "Không"} />
          {err && <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted-foreground)" }}>
            {COLORING_WRITE_ENABLED
              ? "Ghi thật: PDF → presign → upload R2 → POST /api/clone; CSV → import-csv. Đảm bảo upstream trỏ staging."
              : "Nháp lưu local (localStorage). Bật NEXT_PUBLIC_COLORING_WRITE=1 (staging) để tạo job thật."}
          </div>
        </Card>
      )}

      {/* footer nav */}
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <Button variant="ghost" onClick={() => (step === 0 ? router.push(`${B}/jobs`) : setStep(step - 1))}>
          {step === 0 ? "Hủy" : "Quay lại"}
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !canNext0}>
            Tiếp tục <Icon name="chevron-right" size={16} />
          </Button>
        ) : (
          <Button onClick={enqueue} disabled={saving || (COLORING_WRITE_ENABLED && !file)}>
            <Icon name="plus" size={18} /> {saving ? "Đang xử lý…" : "Đưa vào hàng đợi"}
          </Button>
        )}
      </div>
    </div>
  );
}
