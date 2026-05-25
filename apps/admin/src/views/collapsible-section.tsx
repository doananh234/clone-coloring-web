import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/pro-regular-svg-icons";
import { Card, CardContent } from "@vx/core-uikit/components";

type CollapsibleSectionProps = {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

/**
 * Card wrapper with a clickable header that toggles content visibility.
 * Shows an item count badge next to the title.
 */
export function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between p-4 text-left font-semibold hover:bg-accent/50 rounded-t-lg transition-colors"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <FontAwesomeIcon icon={faChevronDown} className="size-4" />
          ) : (
            <FontAwesomeIcon icon={faChevronRight} className="size-4" />
          )}
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {count}
          </span>
        </span>
      </button>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
