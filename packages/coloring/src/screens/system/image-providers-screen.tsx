"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { httpGet, httpPut } from "@vx/core-uikit/api";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Icon } from "../../lib/icon";
import { LoadingRows } from "../../components/ui/states";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "../../data/config";
import { COLORING_BASE as B } from "../../components/shell/nav-config";

type Provider = { name: string; label: string };
type Chain = { primary: string; fallbacks: string[] };
type ConfigResponse = {
  available: Provider[];
  config: Chain | null;
  envDefault: Chain;
  effective: Chain;
};
type Row = { name: string; label: string; enabled: boolean };

const QK = ["settings", "image-providers"] as const;
const mono = { fontFamily: "var(--font-mono)" as const };

/** Ordered rows from the effective chain: enabled (in order) first, then the rest disabled. */
function buildRows(data: ConfigResponse): Row[] {
  const eff = data.config ?? data.envDefault;
  const labelOf = (n: string) => data.available.find((a) => a.name === n)?.label ?? n;
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const n of [eff.primary, ...eff.fallbacks]) {
    if (data.available.some((a) => a.name === n) && !seen.has(n)) {
      rows.push({ name: n, label: labelOf(n), enabled: true });
      seen.add(n);
    }
  }
  for (const a of data.available) {
    if (!seen.has(a.name)) rows.push({ name: a.name, label: a.label, enabled: false });
  }
  return rows;
}

export function ImageProvidersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ConfigResponse>({
    queryKey: QK,
    queryFn: () => httpGet<ConfigResponse>(`${COLORING_API_BASE}/settings/image-providers`),
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) setRows(buildRows(data));
  }, [data]);

  const enabledOrder = rows.filter((r) => r.enabled).map((r) => r.name);
  const primary = enabledOrder[0];

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    setErr(null);
  };
  const toggle = (i: number) => {
    setRows(rows.map((r, k) => (k === i ? { ...r, enabled: !r.enabled } : r)));
    setErr(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!primary) throw new Error("Cần bật ít nhất 1 provider (provider bật đầu tiên là primary).");
      return httpPut<{ config: Chain }>(`${COLORING_API_BASE}/settings/image-providers`, {
        primary,
        fallbacks: enabledOrder.slice(1),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (e) => setErr(e instanceof Error ? e.message : "Lưu thất bại."),
  });

  const dirty =
    data != null &&
    JSON.stringify({ primary, fallbacks: enabledOrder.slice(1) }) !==
      JSON.stringify(data.config ?? data.envDefault);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <div>
        <button
          type="button"
          onClick={() => router.push(`${B}/system`)}
          style={{ border: "none", background: "none", padding: 0, color: "var(--muted-foreground)", cursor: "pointer", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Icon name="arrow-left" size={14} /> Kênh bán & hệ thống
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", marginTop: 6 }}>
          Ưu tiên Image Gen
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
          Kéo thứ tự & bật/tắt provider. Provider <b>bật đầu tiên</b> là <b>primary</b>; các provider bật tiếp theo là chuỗi fallback. Áp dụng runtime (không cần deploy) cho cả admin và worker.
        </p>
      </div>

      {isLoading ? (
        <LoadingRows />
      ) : (
        <>
          <Card title="Thứ tự provider">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((r, i) => (
                <div
                  key={r.name}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    background: r.enabled ? "var(--card)" : "var(--muted)",
                    opacity: r.enabled ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", fontSize: 11, lineHeight: 1.1 }}>
                    <button type="button" aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}
                      style={{ border: "none", background: "none", cursor: i === 0 ? "default" : "pointer", color: "var(--muted-foreground)", padding: 0, opacity: i === 0 ? 0.3 : 1 }}>
                      ▲
                    </button>
                    <button type="button" aria-label="Xuống" disabled={i === rows.length - 1} onClick={() => move(i, 1)}
                      style={{ border: "none", background: "none", cursor: i === rows.length - 1 ? "default" : "pointer", color: "var(--muted-foreground)", padding: 0, opacity: i === rows.length - 1 ? 0.3 : 1 }}>
                      ▼
                    </button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</span>
                      {r.enabled && r.name === primary && <Badge tone="success" dot>Primary</Badge>}
                    </div>
                    <span style={{ ...mono, fontSize: 12, color: "var(--muted-foreground)" }}>{r.name}</span>
                  </div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", color: "var(--muted-foreground)" }}>
                    <input type="checkbox" checked={r.enabled} onChange={() => toggle(i)} />
                    {r.enabled ? "Bật" : "Tắt"}
                  </label>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Chuỗi hiệu lực">
            <div style={{ ...mono, fontSize: 13, color: "var(--foreground)" }}>
              {enabledOrder.length ? enabledOrder.join("  →  ") : <span style={{ color: "var(--danger)" }}>Chưa bật provider nào</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 10 }}>
              Mặc định env: <span style={mono}>{data ? [data.envDefault.primary, ...data.envDefault.fallbacks].join(" → ") : "…"}</span>
              {data?.config == null && " (đang dùng — chưa có cấu hình lưu)"}
            </div>
          </Card>

          {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Button loading={save.isPending} disabled={!COLORING_WRITE_ENABLED || !dirty || !primary} onClick={() => save.mutate()}>
              {save.isPending ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
            {dirty && <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Có thay đổi chưa lưu</span>}
            {!COLORING_WRITE_ENABLED && <span style={{ fontSize: 12.5, color: "var(--danger)" }}>Chế độ local-safe (không ghi)</span>}
          </div>
        </>
      )}
    </div>
  );
}
