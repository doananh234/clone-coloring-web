"use client";

import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { Avatar } from "../../components/ui/avatar";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useEntityList } from "../../data/use-entity-list";

const th = { textAlign: "left" as const, padding: "10px 12px", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "var(--tracking-caps)", color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" };
const td = { padding: 12, borderBottom: "1px solid var(--border)" };

const roleTone: Record<string, BadgeTone> = { admin: "carbon", editor: "info", user: "neutral", viewer: "neutral" };

export function UsersScreen() {
  const router = useRouter();
  const { items, total, isLoading, isError } = useEntityList("users");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <button type="button" onClick={() => router.push(`${B}/system`)} style={{ border: "none", background: "none", padding: 0, color: "var(--muted-foreground)", cursor: "pointer", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="arrow-left" size={14} /> Kênh bán & hệ thống
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", marginTop: 6 }}>Người dùng & quyền</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>{isLoading ? "Đang tải…" : `${total} người dùng`}</p>
      </div>

      <Card>
        {isLoading ? (
          <LoadingRows rows={5} />
        ) : isError ? (
          <ErrorState sub="Không gọi được /users." />
        ) : items.length === 0 ? (
          <EmptyState icon="user" title="Chưa có người dùng" sub="Danh sách người dùng trống trên deployment này." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
              <thead><tr><th style={th}>Người dùng</th><th style={th}>Email</th><th style={th}>Quyền</th></tr></thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="mo-row">
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={u.name || u.email || "?"} size="sm" />
                        <span style={{ fontWeight: 600 }}>{u.name || "—"}</span>
                      </div>
                    </td>
                    <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{u.email || "—"}</td>
                    <td style={td}><Badge tone={roleTone[u.role || "user"] || "neutral"}>{u.role || "user"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 12 }}>
          Đổi quyền cần <span style={{ fontFamily: "var(--font-mono)" }}>PUT /api/users/[id]</span> — sẽ thêm khi cần (theo pattern local-safe).
        </div>
      </Card>
    </div>
  );
}
