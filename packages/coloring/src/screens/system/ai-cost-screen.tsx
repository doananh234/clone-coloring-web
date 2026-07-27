"use client";

import { useRouter } from "next/navigation";
import { Icon, type IconName } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { COLORING_BASE as B } from "../../components/shell/nav-config";

const cap = { fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "var(--tracking-caps)" };
const num = { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, letterSpacing: "-0.02em", marginTop: 6 };

function Kpi({ label, icon }: { label: string; icon: IconName }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={cap}>{label}</div>
          <div style={{ ...num, color: "var(--neutral-400)" }}>—</div>
          <div style={{ marginTop: 8 }}><Badge tone="neutral">chưa có nguồn</Badge></div>
        </div>
        <span style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", background: "var(--carbon-950)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={19} color="#fff" />
        </span>
      </div>
    </Card>
  );
}

export function AiCostScreen() {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <button type="button" onClick={() => router.push(`${B}/system`)} style={{ border: "none", background: "none", padding: 0, color: "var(--muted-foreground)", cursor: "pointer", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="arrow-left" size={14} /> Kênh bán & hệ thống
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", marginTop: 6 }}>Chi phí AI & logs</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>Theo dõi chi phí generation và ngân sách</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
        <Kpi label="Chi phí tháng này" icon="wallet" />
        <Kpi label="Hôm nay" icon="wallet" />
        <Kpi label="Còn lại ngân sách" icon="wallet" />
      </div>

      <Card title="Chưa có nguồn dữ liệu chi phí">
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--foreground)" }}>
          Backend hiện <b>chưa expose endpoint chi phí AI</b>. Model <span style={{ fontFamily: "var(--font-mono)" }}>CreditLedger</span> chỉ theo dõi credit người dùng, không phải AI spend.
          <div style={{ marginTop: 12, color: "var(--muted-foreground)", fontSize: 13 }}>Để bật màn này cần dựng thêm ở backend:</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted-foreground)", fontSize: 13, lineHeight: 1.7 }}>
            <li>Usage/cost log per job (có thể lấy từ <span style={{ fontFamily: "var(--font-mono)" }}>langfuse</span> đã tích hợp).</li>
            <li>Endpoint tổng hợp: chi phí tháng / hôm nay / theo job.</li>
            <li>Cấu hình ngân sách + ngưỡng cảnh báo.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
