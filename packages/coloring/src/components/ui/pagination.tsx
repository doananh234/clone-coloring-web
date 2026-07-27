import { Icon } from "../../lib/icon";
import { Button } from "./button";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({ page, totalPages, onPrev, onNext }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
      <span style={{ fontSize: 12.5, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
        Trang {page} / {totalPages}
      </span>
      <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
        <Icon name="arrow-left" size={16} /> Trước
      </Button>
      <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages}>
        Sau <Icon name="chevron-right" size={16} />
      </Button>
    </div>
  );
}
