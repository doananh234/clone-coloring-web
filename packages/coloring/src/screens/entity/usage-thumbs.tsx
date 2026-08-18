"use client";

import { useRouter } from "next/navigation";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { thumbImg } from "../../data/img";
import type { StyleUsage } from "../../data/group-style-usages";

const CAP = 12;

/** A compact grid of colorized-page thumbnails; each opens its book. Returns null
 *  when empty (the caller renders its own header / empty message). */
export function UsageThumbs({ usages }: { usages: StyleUsage[] }) {
  const router = useRouter();
  if (usages.length === 0) return null;
  const shown = usages.slice(0, CAP);
  const overflow = usages.length - shown.length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(44px,1fr))", gap: 5 }}>
      {shown.map((u) => (
        <button
          key={u.pageId}
          type="button"
          title={u.bookTitle}
          onClick={() => router.push(`${B}/books/${u.bookId}`)}
          style={{ padding: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "#fff", cursor: "pointer", aspectRatio: "1 / 1" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbImg(u.coloredUrl, 300) ?? ""} alt={u.bookTitle} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </button>
      ))}
      {overflow > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "1 / 1", border: "1px dashed var(--border)", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)" }}>
          +{overflow}
        </div>
      )}
    </div>
  );
}
