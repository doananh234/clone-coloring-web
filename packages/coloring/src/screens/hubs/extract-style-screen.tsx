"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { useStyleFromImage } from "../../data/use-more-actions";
import { resolveImg } from "../../data/img";

export interface ExtractStyleScreenProps {
  kind: "art-styles" | "coloring-styles";
}

const META: Record<string, { title: string; sub: string; back: string; backLabel: string }> = {
  "art-styles": { title: "Tạo B&W style từ ảnh", sub: "Analyze 1–3 ảnh line-art → style mới", back: "/styles/bwstyles", backLabel: "B&W style" },
  "coloring-styles": { title: "Tạo coloring style từ ảnh", sub: "Analyze 1–3 ảnh màu → palette & directive", back: "/styles/colorstyles", backLabel: "Coloring style" },
};

export function ExtractStyleScreen({ kind }: ExtractStyleScreenProps) {
  const router = useRouter();
  const m = META[kind];
  const svc = useStyleFromImage(kind);
  const [urls, setUrls] = useState<string[]>(["", "", ""]);
  const [name, setName] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<"analyze" | "create" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const imgs = urls.map((u) => u.trim()).filter(Boolean);

  const analyze = async () => {
    if (imgs.length === 0) return;
    setBusy("analyze"); setErr(null);
    try {
      const parsed = await svc.analyze(imgs);
      setResult(parsed);
      if (!name && typeof parsed.name === "string") setName(parsed.name);
    } catch (e) { setErr(e instanceof Error ? e.message : "Analyze thất bại"); }
    finally { setBusy(null); }
  };

  const create = async () => {
    if (!result) return;
    setBusy("create"); setErr(null);
    try {
      const { id } = await svc.create({ ...result, name: name || result.name, referenceImages: imgs.map((url) => ({ url })) });
      router.push(id ? `${B}/entity/${kind}/${id}` : `${B}${m.back}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Tạo style thất bại"); setBusy(null); }
  };

  const resultFields = result
    ? Object.entries(result).filter(([k, v]) => typeof v === "string" && v.trim() && !["name", "id"].includes(k))
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push(`${B}${m.back}`)}>
          <Icon name="arrow-left" size={16} /> {m.backLabel}
        </Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{m.title}</h1>
        {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Ghi API thật</Badge> : <Badge tone="warning">Cần bật ghi thật</Badge>}
      </div>
      <p style={{ margin: "-8px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>{m.sub}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <Card title="Ảnh tham chiếu (1–3)">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {urls.map((u, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--neutral-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
                    {u.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveImg(u.trim())} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name="image" size={16} />
                    )}
                  </div>
                  <Input placeholder={`URL ảnh ${i + 1}`} value={u} onChange={(e) => setUrls((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
              ))}
              <Button onClick={analyze} disabled={!svc.enabled || busy !== null || imgs.length === 0}>
                <Icon name="wand" size={18} /> {busy === "analyze" ? "Đang analyze…" : "Analyze ảnh"}
              </Button>
              {!svc.enabled && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Analyze/Tạo style cần bật ghi thật (staging) + backend AI.</div>}
              {err && <div style={{ padding: "8px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}
            </div>
          </Card>
        </div>

        <div style={{ flex: "2 1 400px", minWidth: 0 }}>
          <Card title="Kết quả analyze">
            {!result ? (
              <div style={{ padding: "32px 8px", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13.5 }}>
                Nhập URL ảnh rồi bấm Analyze để trích style.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "block" }}><span className="mo-flabel">Tên style</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
                {resultFields.map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.55 }}>{String(v)}</div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                  <Button variant="ghost" onClick={() => setResult(null)}>Làm lại</Button>
                  <Button onClick={create} disabled={busy !== null || !name.trim()}>{busy === "create" ? "Đang tạo…" : "Tạo style"}</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
