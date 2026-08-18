"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { StylePicker } from "../../components/ui/style-picker";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { useBook } from "../../data/use-book";
import { useEntityList } from "../../data/use-entity-list";
import { useColorizeBook } from "../../data/use-colorize";
import { thumbImg } from "../../data/img";

export function ColorizeScreen({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { book, isLoading, isError } = useBook(bookId);
  const { items: styles, isLoading: stylesLoading } = useEntityList("coloring-styles");
  const colorize = useColorizeBook(bookId);
  const [styleId, setStyleId] = useState("");
  const [useReference, setUseReference] = useState(true);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ err?: string; ok?: string } | null>(null);
  const [running, setRunning] = useState(false);

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

  const pages = (book.coloringPages ?? []).map((p) => ({ id: p.id, url: p.url }));
  const styleItems = styles.map((s) => ({ id: s.id, name: s.name, image: thumbImg(s.thumbnailUrl || s.referenceImageUrl || undefined, 400) }));
  // Coloring style auto-extracted from the source cover at create-book time.
  const sourceStyleId = (book.data?.coloringStyleId as string) || "";
  const sourceStyleExists = Boolean(sourceStyleId) && styleItems.some((s) => s.id === sourceStyleId);
  const chosen = styleId || (sourceStyleExists ? sourceStyleId : "") || styleItems[0]?.id || "";

  const run = async () => {
    if (!chosen || pages.length === 0) return;
    setRunning(true);
    setMsg(null);
    setProg({ done: 0, total: pages.length });
    try {
      const { done, failed } = await colorize(chosen, pages, (d, t) => setProg({ done: d, total: t }), useReference);
      setMsg({ ok: `Tô màu xong ${done - failed}/${done} trang${failed ? ` · ${failed} lỗi` : ""}` });
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : "Tô màu thất bại" });
    } finally {
      setRunning(false);
    }
  };

  const pct = prog ? Math.round((prog.done / prog.total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push(`${B}/books/${bookId}`)}>
          <Icon name="arrow-left" size={16} /> Chi tiết sách
        </Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Tô màu AI</h1>
        {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Ghi API thật</Badge> : <Badge tone="warning">Chỉ chạy khi bật ghi thật</Badge>}
      </div>

      <Card title={book.title}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13.5, color: "var(--muted-foreground)" }}>{pages.length} trang sẽ được tô màu lại theo style đã chọn.</div>
          <div>
            <div className="mo-flabel" style={{ marginBottom: 8 }}>Coloring style</div>
            <StylePicker items={styleItems} value={chosen} onChange={setStyleId} loading={stylesLoading} emptyText="Chưa có coloring-style." />
            {sourceStyleExists && chosen === sourceStyleId && (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8 }}>Đang dùng coloring style trích từ bìa gốc (auto khi clone). Đổi style khác nếu muốn.</div>
            )}
          </div>

          <div>
            <div className="mo-flabel" style={{ marginBottom: 8 }}>Chế độ tô</div>
            <div style={{ display: "inline-flex", padding: 3, gap: 3, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--neutral-100)" }} role="group" aria-label="Chế độ tô">
              {([
                { key: true, label: "Prompt + ảnh tham chiếu", icon: "image" as const },
                { key: false, label: "Chỉ prompt (directive)", icon: "wand" as const },
              ]).map((opt) => {
                const active = useReference === opt.key;
                return (
                  <button key={String(opt.key)} type="button" onClick={() => setUseReference(opt.key)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", borderRadius: "var(--radius-sm)", background: active ? "var(--card)" : "transparent", color: active ? "var(--foreground)" : "var(--muted-foreground)", boxShadow: active ? "var(--shadow-sm)" : undefined }}>
                    <Icon name={opt.icon} size={15} /> {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>
              {useReference
                ? "Gửi kèm ảnh màu tham chiếu của style làm neo thị giác → bám sát bộ màu/phong cách gốc hơn."
                : "Chỉ dùng directive (mô tả + hex palette dạng chữ). Nhẹ hơn, nhưng bám màu kém chính xác hơn ảnh tham chiếu."}
            </div>
          </div>

          {prog && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ color: "var(--muted-foreground)" }}>Đang tô…</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{prog.done}/{prog.total}</span>
              </div>
              <Progress value={pct} />
            </div>
          )}
          {msg && (
            <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: msg.err ? "var(--danger-bg)" : "var(--success-bg)", color: msg.err ? "var(--danger)" : "var(--success)" }}>
              {msg.err || msg.ok}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={run} disabled={running || !chosen || pages.length === 0}>
              <Icon name="palette" size={18} /> {running ? "Đang tô…" : `Tô màu ${pages.length} trang`}
            </Button>
            <Button variant="ghost" onClick={() => router.push(`${B}/books/${bookId}`)}>Xong</Button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Mỗi trang gọi <span style={{ fontFamily: "var(--font-mono)" }}>POST /coloring-styles/colorize</span> (tuần tự). Đây là AI generation tốn phí — chỉ chạy khi bật ghi thật + upstream staging.
          </div>
        </div>
      </Card>
    </div>
  );
}
