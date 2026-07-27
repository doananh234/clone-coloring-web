"use client";

import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { COLORING_API_BASE, COLORING_IMG_BASE, COLORING_WRITE_ENABLED } from "../../data/config";

const mono = { fontFamily: "var(--font-mono)" as const };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5, alignItems: "center" }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
    </div>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <div>
        <button type="button" onClick={() => router.push(`${B}/system`)} style={{ border: "none", background: "none", padding: 0, color: "var(--muted-foreground)", cursor: "pointer", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="arrow-left" size={14} /> Kênh bán & hệ thống
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", marginTop: 6 }}>Cài đặt hệ thống</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>Cấu hình nguồn dữ liệu và giao diện của surface Coloring</p>
      </div>

      <Card title="Nguồn dữ liệu (real config)">
        <Row label="API base"><span style={mono}>{COLORING_API_BASE}</span></Row>
        <Row label="Image base"><span style={mono}>{COLORING_IMG_BASE}</span></Row>
        <Row label="Chế độ ghi">
          {COLORING_WRITE_ENABLED ? <Badge tone="danger" dot>Bật (ghi API thật)</Badge> : <Badge tone="success" dot>Tắt (local-safe)</Badge>}
        </Row>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 12 }}>
          Đổi qua env: <span style={mono}>NEXT_PUBLIC_COLORING_API_BASE</span>, <span style={mono}>NEXT_PUBLIC_COLORING_WRITE=1</span>, <span style={mono}>COLORING_API_UPSTREAM</span> (staging).
        </div>
      </Card>

      <Card title="Giao diện">
        <div style={{ fontSize: 13.5, color: "var(--foreground)" }}>
          Đổi Light / Dark bằng nút <Icon name="moon" size={14} /> / <Icon name="sun" size={14} /> trên header. Lựa chọn lưu ở <span style={mono}>localStorage</span> (motio-theme).
        </div>
      </Card>

      <Card title="Cài đặt phía server">
        <div style={{ fontSize: 13.5, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          Các cài đặt hệ thống phía server (brand mặc định, ngưỡng ngân sách, quyền mặc định…) <b>chưa có endpoint</b> — cần dựng thêm ở backend để chỉnh từ đây.
        </div>
      </Card>
    </div>
  );
}
