"use client";

import { useRouter } from "next/navigation";
import { Card } from "../../components/ui/card";
import { LoadingRows } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { resolveImg } from "../../data/img";
import { useStyleUsages } from "../../data/use-style-usages";
import { groupUsagesByVariant, type UsageVariant, type UsageGroup } from "../../data/group-style-usages";

const CAP = 24;

/** Gallery of book pages colorized with this style, grouped by color variant.
 *  Read-only; click an image to open its book. Rendered only for coloring-styles. */
export function StyleUsagesSection({ styleId, variants }: { styleId: string; variants: UsageVariant[] | undefined }) {
  const router = useRouter();
  const { usages, isLoading } = useStyleUsages(styleId);
  const groups = groupUsagesByVariant(usages, variants);

  return (
    <Card title={`Đã dùng để tô · ${usages.length}`}>
      {isLoading ? (
        <LoadingRows rows={2} />
      ) : usages.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Chưa có trang nào tô bằng style này.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map((g) => (
            <UsageGroupBlock key={g.variantId ?? "__unknown__"} group={g} onOpen={(bookId) => router.push(`${B}/books/${bookId}`)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function UsageGroupBlock({ group, onOpen }: { group: UsageGroup; onOpen: (bookId: string) => void }) {
  const shown = group.usages.slice(0, CAP);
  const overflow = group.usages.length - shown.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {group.swatches.length > 0 && (
          <div style={{ display: "flex", gap: 3 }}>
            {group.swatches.slice(0, 6).map((c, i) => (
              <span key={i} title={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid var(--border)" }} />
            ))}
          </div>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{group.label}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>· {group.usages.length}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 8 }}>
        {shown.map((u) => (
          <button key={u.pageId} type="button" onClick={() => onOpen(u.bookId)} title={u.bookTitle}
            style={{ padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "#fff", cursor: "pointer", aspectRatio: "1 / 1" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveImg(u.coloredUrl)} alt={u.bookTitle} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
        {overflow > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "1 / 1", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)" }}>+{overflow}</div>
        )}
      </div>
    </div>
  );
}
