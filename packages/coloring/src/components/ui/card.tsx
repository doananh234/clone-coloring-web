import type { CSSProperties, ReactNode } from "react";

export interface CardProps {
  title?: ReactNode;
  /** Optional node rendered on the right of the title row. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

export function Card({ title, action, children, className, style, bodyStyle }: CardProps) {
  return (
    <div className={["mo-card", className].filter(Boolean).join(" ")} style={style}>
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {title ? <h3 className="mo-card__title" style={{ margin: 0 }}>{title}</h3> : <span />}
          {action}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}
