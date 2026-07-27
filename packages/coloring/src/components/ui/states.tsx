import type { ReactNode } from "react";
import { Icon, type IconName } from "../../lib/icon";

export function Skeleton({ w = "100%", h = 14, radius }: { w?: number | string; h?: number | string; radius?: number }) {
  return <div className="mo-skel" style={{ width: w, height: h, borderRadius: radius }} />;
}

/** Stacked skeleton rows for loading tables/lists. */
export function LoadingRows({ rows = 6, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={height} radius={10} />
      ))}
    </div>
  );
}

function Centered({ icon, title, sub }: { icon: IconName; title: string; sub?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 24px", textAlign: "center" }}>
      <span style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>
        <Icon name={icon} size={20} />
      </span>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 400 }}>{sub}</div>}
    </div>
  );
}

export function EmptyState({ title = "Chưa có dữ liệu", sub, icon = "folder" }: { title?: string; sub?: ReactNode; icon?: IconName }) {
  return <Centered icon={icon} title={title} sub={sub} />;
}

export function ErrorState({ sub }: { sub?: ReactNode }) {
  return (
    <Centered
      icon="alert-triangle"
      title="Không tải được dữ liệu"
      sub={sub ?? "Kiểm tra kết nối API hoặc thử lại."}
    />
  );
}
