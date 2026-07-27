"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/form-controls";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { useCreateEntity } from "../../data/use-create-entity";

export interface EntityCreateScreenProps {
  kind: "brands" | "categories";
}

const META = {
  brands: { title: "Tạo brand", back: "/library/brands", backLabel: "Brand" },
  categories: { title: "Tạo danh mục", back: "/library/categories", backLabel: "Danh mục" },
};

export function EntityCreateScreen({ kind }: EntityCreateScreenProps) {
  const router = useRouter();
  const m = META[kind];
  const svc = useCreateEntity(kind);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> =
        kind === "brands"
          ? { name: name.trim(), displayName: displayName.trim() || undefined, description: description.trim() || undefined, isPublic }
          : { name: name.trim(), description: description.trim() || undefined };
      const { id } = await svc.create(payload);
      router.push(id ? `${B}/entity/${kind}/${id}` : `${B}${m.back}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tạo thất bại");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push(`${B}${m.back}`)}><Icon name="arrow-left" size={16} /> {m.backLabel}</Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{m.title}</h1>
        {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Ghi API thật</Badge> : <Badge tone="warning">Cần bật ghi thật</Badge>}
      </div>

      <Card title="Thông tin">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={{ display: "block" }}><span className="mo-flabel">Tên</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          {kind === "brands" && (
            <label style={{ display: "block" }}><span className="mo-flabel">Tên hiển thị</span><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          )}
          <label style={{ display: "block" }}>
            <span className="mo-flabel">Mô tả</span>
            <textarea className="mo-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 80, padding: 12, resize: "vertical", lineHeight: 1.55 }} />
          </label>
          {kind === "brands" && <Switch label="Công khai" checked={isPublic} onChange={setIsPublic} />}
          {err && <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <Button variant="ghost" onClick={() => router.push(`${B}${m.back}`)}>Hủy</Button>
            <Button onClick={create} disabled={saving || !svc.enabled || !name.trim()}><Icon name="plus" size={18} /> {saving ? "Đang tạo…" : "Tạo"}</Button>
          </div>
          {!svc.enabled && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Tạo mới cần bật ghi thật (staging).</div>}
        </div>
      </Card>
    </div>
  );
}
