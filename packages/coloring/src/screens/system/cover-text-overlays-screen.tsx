"use client";

import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Icon } from "../../lib/icon";
import { LoadingRows } from "../../components/ui/states";
import { useCoverTextOverlays } from "../../data/use-cover-text-overlays";
import { resolveImg } from "../../data/img";

/** Count elements whose loosely-typed value has `present === true`. */
function countPresentElements(elements: Record<string, unknown>): number {
  return Object.values(elements).filter(
    (v) => typeof v === "object" && v !== null && (v as { present?: unknown }).present === true,
  ).length;
}

export function CoverTextOverlaysScreen() {
  const { overlays, isLoading, remove, rename, enabled } = useCoverTextOverlays();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24 }}>Quản lý bố cục chữ bìa</h1>
      </div>
      {err && (
        <div
          style={{
            fontSize: 12.5,
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--danger-bg)",
            color: "var(--danger)",
          }}
        >
          {err}
        </div>
      )}
      {!enabled && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Đổi tên/xoá bố cục cần bật ghi thật (staging).</div>}

      {isLoading ? (
        <Card>
          <LoadingRows rows={4} />
        </Card>
      ) : overlays.length === 0 ? (
        <Card>
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)" }}>
            Chưa có bố cục nào. Lưu từ cover editor.
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {overlays.map((o) => {
            const src = resolveImg(o.referenceImageUrl);
            const roleCount = countPresentElements(o.elements);
            return (
              <Card key={o.id}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div
                    style={{
                      aspectRatio: "1 / 1",
                      borderRadius: "var(--radius-md)",
                      overflow: "hidden",
                      border: "1px solid var(--border)",
                      background: "var(--neutral-100)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--neutral-400)",
                    }}
                  >
                    {src ? (
                      <img src={src} alt={o.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      <Icon name="layers" size={28} />
                    )}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.name}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>{roleCount} vùng chữ</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!enabled}
                      onClick={async () => {
                        const name = window.prompt("Đổi tên bố cục", o.name);
                        if (name && name !== o.name) {
                          try {
                            await rename(o.id, name);
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : "Đổi tên thất bại.");
                          }
                        }
                      }}
                    >
                      Đổi tên
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!enabled}
                      onClick={async () => {
                        if (window.confirm(`Xoá bố cục "${o.name}"?`)) {
                          try {
                            await remove(o.id);
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : "Xoá thất bại.");
                          }
                        }
                      }}
                    >
                      Xoá
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
