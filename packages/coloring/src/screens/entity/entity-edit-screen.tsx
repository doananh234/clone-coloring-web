"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useEntity } from "../../data/use-entity";
import { useSaveEntity } from "../../data/use-write";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { ENTITY_KINDS } from "./entity-detail-screen";
import { humanize, editableStringFields } from "./entity-fields";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="mo-flabel">{label}</span>
      {children}
    </label>
  );
}

function Area({ value, onChange, min = 72 }: { value: string; onChange: (v: string) => void; min?: number }) {
  return (
    <textarea
      className="mo-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minHeight: min, padding: 12, resize: "vertical", lineHeight: 1.55 }}
    />
  );
}

export function EntityEditScreen({ kind, id }: { kind: string; id: string }) {
  const router = useRouter();
  const cfg = ENTITY_KINDS[kind];
  const { entity, isLoading, isError } = useEntity(cfg?.path ?? "", id);
  const saveEntity = useSaveEntity(kind, id);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (entity && form === null) {
      const init: Record<string, string> = {
        name: (entity.displayName as string) || (entity.name as string) || "",
        description: (entity.description as string) || "",
        tags: Array.isArray(entity.tags) ? (entity.tags as string[]).join(", ") : "",
      };
      for (const k of editableStringFields(entity)) init[k] = entity[k] as string;
      setForm(init);
    }
  }, [entity, form]);

  const backToDetail = () => router.push(`${B}/entity/${kind}/${id}`);

  if (!cfg) return <Card><ErrorState sub={`Loại entity không hợp lệ: ${kind}`} /></Card>;
  if (isLoading || (!form && !isError)) return <Card><LoadingRows rows={6} /></Card>;
  if (isError || !entity || !form) {
    return (
      <Card>
        <ErrorState sub={`Không tải được ${cfg.title.toLowerCase()} ${id}.`} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outline" size="sm" onClick={() => router.push(cfg.backHref)}>Về {cfg.backLabel}</Button>
        </div>
      </Card>
    );
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...(f ?? {}), [k]: v }));
  const extraKeys = Object.keys(form).filter((k) => k !== "name" && k !== "description" && k !== "tags");

  const save = async () => {
    const nameKey = entity.displayName != null ? "displayName" : "name";
    const patch: Record<string, unknown> = {
      [nameKey]: form.name,
      description: form.description,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    for (const k of extraKeys) patch[k] = form[k];
    setSaving(true);
    setErr(null);
    try {
      await saveEntity(patch);
      backToDetail();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lưu thất bại");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={backToDetail}>
          <Icon name="arrow-left" size={16} /> {cfg.title}
        </Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Sửa {cfg.title.toLowerCase()}</h1>
        {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Ghi API thật</Badge> : <Badge tone="warning">Lưu local · không đụng data thật</Badge>}
      </div>

      <Card title="Thông tin cơ bản">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Field label="Tên"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Mô tả"><Area value={form.description} onChange={(v) => set("description", v)} /></Field>
          <Field label="Tags"><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="cách nhau bằng dấu phẩy" /></Field>
        </div>
      </Card>

      {extraKeys.length > 0 && (
        <Card title="Chi tiết">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {extraKeys.map((k) => (
              <Field key={k} label={humanize(k)}><Area value={form[k]} onChange={(v) => set(k, v)} min={96} /></Field>
            ))}
          </div>
        </Card>
      )}

      {err && (
        <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={backToDetail}>Hủy</Button>
        <Button onClick={save} disabled={saving}>
          <Icon name="check" size={18} /> {saving ? "Đang lưu…" : COLORING_WRITE_ENABLED ? "Lưu" : "Lưu (local)"}
        </Button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        {COLORING_WRITE_ENABLED
          ? `Ghi thật qua PUT /api/${cfg.path}/[id] — chỉ các column hợp lệ (field không phải column bị bỏ để không phá data cũ). Đảm bảo upstream trỏ staging.`
          : `Lưu local, hiển thị chồng lên bản thật. Map sẵn PUT /api/${cfg.path}/[id] — bật NEXT_PUBLIC_COLORING_WRITE=1 để ghi thật.`}
      </div>
    </div>
  );
}
