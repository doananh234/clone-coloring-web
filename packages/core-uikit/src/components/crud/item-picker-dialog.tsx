import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

type ItemPickerDialogProps<T extends Record<string, unknown>> = {
  /** Whether the dialog is open. */
  open: boolean;
  /** Callback when open state changes. */
  onOpenChange: (open: boolean) => void;
  /** Dialog title. */
  title: string;
  /** Items available for selection. */
  items: T[];
  /** Show loading skeletons while fetching items. */
  isLoading?: boolean;
  /** Key of T to display as the item label. */
  displayField: keyof T & string;
  /** Optional key of T containing an image URL for thumbnail. */
  imageField?: keyof T & string;
  /** Currently selected item IDs (controlled). */
  selectedIds?: string[];
  /** Called with selected IDs when user confirms. */
  onConfirm: (selectedIds: string[]) => void;
};

/**
 * Modal dialog for searching and multi-selecting items from a list.
 *
 * Filters client-side by `displayField`. Shows optional image thumbnails
 * and a confirm button with selection count.
 */
export function ItemPickerDialog<T extends Record<string, unknown> & { id: string }>({
  open,
  onOpenChange,
  title,
  items,
  isLoading,
  displayField,
  imageField,
  selectedIds = [],
  onConfirm,
}: ItemPickerDialogProps<T>) {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));

  // Reset internal state when dialog opens with new selectedIds
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(selectedIds));
      setSearch("");
    }
  }, [open, selectedIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => {
      const value = item[displayField];
      return typeof value === "string" && value.toLowerCase().includes(q);
    });
  }, [items, search, displayField]);

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />

        <div className="max-h-64 overflow-y-auto space-y-1">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("noResults")}</p>
          ) : (
            filtered.map((item) => {
              const id = item.id;
              const label = String(item[displayField] ?? "");
              const imgSrc = imageField ? (item[imageField] as string | undefined) : undefined;

              return (
                <label
                  key={id}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                >
                  <Checkbox checked={selected.has(id)} onCheckedChange={() => toggleItem(id)} />
                  {imgSrc && (
                    <img
                      src={imgSrc}
                      alt={label}
                      className="size-8 rounded object-cover shrink-0"
                    />
                  )}
                  <span className="text-sm truncate">{label}</span>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleConfirm}>
            {t("confirm")}
            {selected.size > 0 && <span className="ml-1">({selected.size})</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
