"use client";

import { useRef, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Icon } from "../../lib/icon";
import { LoadingRows } from "../../components/ui/states";
import { useFonts } from "../../data/use-fonts";

export function FontsScreen() {
  const { fonts, isLoading, upload, remove, rename, enabled } = useFonts();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const name = file.name.replace(/\.(woff2|ttf|otf)$/i, "").replace(/[-_]+/g, " ").trim() || "Font";
      await upload(file, name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload font thất bại.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24 }}>Quản lý font</h1>
        <Button size="sm" disabled={!enabled || busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={15} /> {busy ? "Đang tải…" : "Tải font lên"}
        </Button>
        <input ref={fileRef} type="file" accept=".woff2,.ttf,.otf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
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
      {!enabled && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Tải/xoá font cần bật ghi thật (staging).</div>}

      {isLoading ? (
        <Card>
          <LoadingRows rows={4} />
        </Card>
      ) : fonts.length === 0 ? (
        <Card>
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)" }}>
            Chưa có font nào. Tải lên .woff2/.ttf/.otf (≤ 2MB).
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
          {fonts.map((f) => (
            <Card key={f.id}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontFamily: f.name, fontSize: 26, lineHeight: 1.2 }}>Aa Bb 123</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                    {f.format}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!enabled}
                    onClick={async () => {
                      const name = window.prompt("Đổi tên font", f.name);
                      if (name && name !== f.name) {
                        try {
                          await rename(f.id, name);
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
                      if (window.confirm(`Xoá font "${f.name}"?`)) {
                        try {
                          await remove(f.id);
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
          ))}
        </div>
      )}
    </div>
  );
}
