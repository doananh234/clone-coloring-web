export type AvatarSize = "sm" | "md";

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

const DIMS: Record<AvatarSize, { box: number; font: number }> = {
  sm: { box: 28, font: 12 },
  md: { box: 36, font: 14 },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  const d = DIMS[size];
  return (
    <span
      className={["mo-avatar", className].filter(Boolean).join(" ")}
      style={{ width: d.box, height: d.box, fontSize: d.font }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
