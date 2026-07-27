"use client";

import { useRouter } from "next/navigation";
import { Icon, type IconName } from "../../lib/icon";

export interface HubCard {
  icon: IconName;
  title: string;
  sub: string;
  href: string;
}

export interface HubScreenProps {
  title: string;
  subtitle: string;
  cards: HubCard[];
  maxWidth?: number;
}

/** Design's hub landing (square nav cards → dedicated list screens). */
export function HubScreen({ title, subtitle, cards, maxWidth = 860 }: HubScreenProps) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{title}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>{subtitle}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16, maxWidth }}>
        {cards.map((c) => (
          <div
            key={c.href}
            onClick={() => router.push(c.href)}
            className="mo-bookcard"
            style={{ aspectRatio: "1 / 1", justifyContent: "space-between" }}
          >
            <span style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--carbon-950)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name={c.icon} size={22} color="var(--volt-500)" />
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
