import type React from "react";
import { Card, CardContent } from "@vx/core-uikit/components";

type DetailCardProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function DetailCard({ title, subtitle, actions, children, className }: DetailCardProps) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}
