import { Icon } from "../../lib/icon";

export interface EntityTile {
  id: string;
  name: string;
  image?: string;
  subtitle?: string;
}

export interface EntityGridProps {
  tiles: EntityTile[];
  /** Square thumbnails (portraits) vs 3:4 (book-like). Default square. */
  ratio?: "1 / 1" | "3 / 4";
  onOpen?: (id: string) => void;
}

export function EntityGrid({ tiles, ratio = "1 / 1", onOpen }: EntityGridProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 14 }}>
      {tiles.map((t) => (
        <div key={t.id} style={{ cursor: onOpen ? "pointer" : "default" }} onClick={onOpen ? () => onOpen(t.id) : undefined}>
          <div
            className="mo-bookthumb"
            style={{
              aspectRatio: ratio,
              borderRadius: "var(--radius-md)",
              background: "var(--neutral-100)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--neutral-400)",
              overflow: "hidden",
            }}
          >
            {t.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.image} alt={t.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Icon name="image" size={22} />
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.name}
          </div>
          {t.subtitle && (
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
