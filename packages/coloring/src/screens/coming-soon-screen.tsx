import { Card } from "../components/ui/card";
import { Icon } from "../lib/icon";

export interface ComingSoonScreenProps {
  title: string;
}

/** Placeholder for screens not yet ported (later phases). Keeps nav links from 404-ing. */
export function ComingSoonScreen({ title }: ComingSoonScreenProps) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 24px", textAlign: "center" }}>
        <span
          style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-md)",
            background: "var(--carbon-950)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="palette" size={22} color="var(--volt-500)" />
        </span>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted-foreground)", maxWidth: 420 }}>
          Màn này nằm trong các phase tiếp theo của bản port. Shell, theme Motio và trang Tổng quan
          đã hoạt động — các màn còn lại sẽ được thêm dần.
        </p>
      </div>
    </Card>
  );
}
