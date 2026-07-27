export interface ProgressProps {
  /** 0–100 */
  value: number;
  tone?: "volt" | "danger";
  className?: string;
}

export function Progress({ value, tone = "volt", className }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={["mo-progress", className].filter(Boolean).join(" ")}>
      <div
        className={["mo-progress__fill", tone === "danger" && "mo-progress__fill--danger"]
          .filter(Boolean)
          .join(" ")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
