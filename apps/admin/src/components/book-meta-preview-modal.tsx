"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCheck,
  faChevronDown,
} from "@fortawesome/pro-regular-svg-icons";
import type { BookMetaGenerationResult } from "@/lib/ai/prompts/book-meta-prompt";

type FieldEntry = {
  key: string;
  label: string;
  currentValue: string;
  generatedValue: string;
  section: "general" | "discovery" | "etsy";
  longText: boolean;
};

type BookMetaPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatedData: BookMetaGenerationResult;
  currentData: Record<string, unknown>;
  onApply: (selected: Record<string, unknown>) => void;
};

const EMPTY = "—";

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return String(value);
  return String(value);
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let result: unknown = obj;
  for (const part of parts) {
    if (result === null || result === undefined) return undefined;
    result = (result as Record<string, unknown>)[part];
  }
  return result;
}

function buildFieldEntries(
  generated: BookMetaGenerationResult,
  current: Record<string, unknown>,
  t: (key: string) => string,
): FieldEntry[] {
  const general = [
    { key: "title", genPath: "title", curPath: "title" },
    { key: "subtitle", genPath: "subtitle", curPath: "subtitle" },
    { key: "description", genPath: "description", curPath: "description", long: true },
    { key: "badge", genPath: "badge", curPath: "badge" },
    { key: "categoryId", genPath: "categoryId", curPath: "categoryId" },
    { key: "category", genPath: "category", curPath: "category" },
    { key: "price", genPath: "price", curPath: "price" },
    { key: "ageRange", genPath: "ageRange", curPath: "specifications.ageRange" },
    { key: "dimensions", genPath: "dimensions", curPath: "specifications.dimensions" },
    { key: "backgroundColor", genPath: "backgroundColor", curPath: "backgroundColor" },
  ];

  const discovery = [
    { key: "tags", genPath: "tags", curPath: "tags" },
    { key: "primaryColor", genPath: "primaryColor", curPath: "primaryColor" },
    { key: "secondaryColor", genPath: "secondaryColor", curPath: "secondaryColor" },
    { key: "themeStyle", genPath: "themeStyle", curPath: "themeStyle" },
    { key: "holiday", genPath: "holiday", curPath: "holiday" },
    { key: "occasion", genPath: "occasion", curPath: "occasion" },
  ];

  const etsy = [
    { key: "etsyTitle", genPath: "etsyListing.etsyTitle", curPath: "etsyListing.etsyTitle" },
    { key: "etsyDescription", genPath: "etsyListing.etsyDescription", curPath: "etsyListing.etsyDescription", long: true },
    { key: "materials", genPath: "etsyListing.materials", curPath: "etsyListing.materials" },
    { key: "etsyCategory", genPath: "etsyListing.etsyCategory", curPath: "etsyListing.etsyCategory" },
    { key: "subcategory", genPath: "etsyListing.subcategory", curPath: "etsyListing.subcategory" },
    { key: "priceSuggestionUsd", genPath: "etsyListing.priceSuggestionUsd", curPath: "etsyListing.priceSuggestionUsd" },
    { key: "priceNotes", genPath: "etsyListing.priceNotes", curPath: "etsyListing.priceNotes" },
    { key: "section", genPath: "etsyListing.section", curPath: "etsyListing.section" },
  ];

  const map = (
    fields: Array<{ key: string; genPath: string; curPath: string; long?: boolean }>,
    section: FieldEntry["section"],
  ): FieldEntry[] =>
    fields.map(({ key, genPath, curPath, long }) => ({
      key,
      label: t(`fields.${key}`),
      currentValue: formatValue(getNestedValue(current, curPath)),
      generatedValue: formatValue(getNestedValue(generated, genPath)),
      section,
      longText: long ?? false,
    }));

  return [...map(general, "general"), ...map(discovery, "discovery"), ...map(etsy, "etsy")];
}

const NESTED_FIELD_MAP: Record<string, string> = {
  ageRange: "specifications.ageRange",
  dimensions: "specifications.dimensions",
};

export function BookMetaPreviewModal({
  open,
  onOpenChange,
  generatedData,
  currentData,
  onApply,
}: BookMetaPreviewModalProps) {
  const { t } = useTranslation("books");
  const fields = useMemo(
    () => buildFieldEntries(generatedData, currentData, t),
    [generatedData, currentData, t],
  );

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        fields.filter((f) => f.generatedValue !== EMPTY).map((f) => f.key),
      ),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleField = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectAll = () => setSelected(new Set(fields.map((f) => f.key)));
  const deselectAll = () => setSelected(new Set());

  function handleApply() {
    const result: Record<string, unknown> = {};
    const etsyResult: Record<string, unknown> = {};
    for (const field of fields) {
      if (!selected.has(field.key)) continue;
      if (field.section === "etsy") {
        const genEtsy = generatedData.etsyListing as Record<string, unknown>;
        etsyResult[field.key] = genEtsy[field.key];
      } else {
        const gen = generatedData as Record<string, unknown>;
        const formKey = NESTED_FIELD_MAP[field.key] ?? field.key;
        result[formKey] = gen[field.key];
      }
    }
    if (Object.keys(etsyResult).length > 0) {
      etsyResult.generatedAt = new Date().toISOString();
      result.etsyListing = etsyResult;
    }
    onApply(result);
    onOpenChange(false);
  }

  const sections: Array<{
    key: string;
    label: string;
    filter: FieldEntry["section"];
  }> = [
    { key: "general", label: t("generateMeta.generalSection"), filter: "general" },
    { key: "discovery", label: t("generateMeta.discoverySection"), filter: "discovery" },
    { key: "etsy", label: t("generateMeta.etsySection"), filter: "etsy" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(960px,95vw)] max-w-none flex-col gap-0 p-0">
        <DialogHeader className="flex-row items-center justify-between border-b px-6 py-4">
          <div className="space-y-1">
            <DialogTitle className="text-base">
              {t("generateMeta.previewTitle")}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {t("generateMeta.previewSubtitle", {
                defaultValue:
                  "Review each field and pick what to apply. Strikethrough = current value, highlighted = AI suggestion.",
              })}
            </p>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-2.5">
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="font-medium text-primary hover:underline"
            >
              {t("generateMeta.selectAll")}
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={deselectAll}
              className="font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("generateMeta.deselectAll")}
            </button>
          </div>
          <Badge variant="secondary" className="font-mono text-[11px]">
            {selected.size} / {fields.length}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {sections.map((section) => {
              const sectionFields = fields.filter(
                (f) => f.section === section.filter,
              );
              const selectedCount = sectionFields.filter((f) =>
                selected.has(f.key),
              ).length;
              return (
                <section key={section.key}>
                  <div className="sticky top-0 z-10 -mx-6 mb-1 flex items-center justify-between border-b bg-background/95 px-6 py-1.5 backdrop-blur">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.label}
                    </h3>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {selectedCount}/{sectionFields.length}
                    </span>
                  </div>

                  <ul className="divide-y divide-border/60">
                    {sectionFields.map((field) => {
                      const isSelected = selected.has(field.key);
                      const isExpanded = expanded.has(field.key);
                      const hasChange =
                        field.currentValue !== field.generatedValue;
                      const noSuggestion = field.generatedValue === EMPTY;

                      return (
                        <li
                          key={field.key}
                          className={`flex gap-3 px-1 py-2.5 transition-colors ${
                            isSelected ? "" : "opacity-60"
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleField(field.key)}
                            disabled={noSuggestion}
                            className="mt-1 shrink-0"
                            aria-label={field.label}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => !noSuggestion && toggleField(field.key)}
                                className="text-left text-sm font-medium leading-tight"
                              >
                                {field.label}
                              </button>
                              {!hasChange && !noSuggestion && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-normal text-muted-foreground"
                                >
                                  {t("generateMeta.unchanged", {
                                    defaultValue: "unchanged",
                                  })}
                                </Badge>
                              )}
                              {noSuggestion && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-normal text-muted-foreground"
                                >
                                  {t("generateMeta.noSuggestion", {
                                    defaultValue: "no suggestion",
                                  })}
                                </Badge>
                              )}
                            </div>

                            {field.longText ? (
                              <LongDiff
                                current={field.currentValue}
                                generated={field.generatedValue}
                                expanded={isExpanded}
                                onToggleExpand={() => toggleExpand(field.key)}
                              />
                            ) : (
                              <InlineDiff
                                current={field.currentValue}
                                generated={field.generatedValue}
                              />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>

        <DialogFooter className="border-t bg-background px-6 py-3 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t("generateMeta.applyHint", {
              defaultValue: "Only checked fields will be applied.",
            })}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common:cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={selected.size === 0}
            >
              <FontAwesomeIcon icon={faCheck} className="mr-1.5 h-3.5 w-3.5" />
              {t("generateMeta.applySelected")} ({selected.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InlineDiff({
  current,
  generated,
}: {
  current: string;
  generated: string;
}) {
  const noSuggestion = generated === EMPTY;
  const noChange = current === generated;
  return (
    <div className="mt-1 flex items-center gap-2 text-xs">
      <span
        className={`truncate ${
          noChange ? "text-muted-foreground" : "text-muted-foreground line-through"
        }`}
        title={current}
      >
        {current}
      </span>
      {!noChange && !noSuggestion && (
        <>
          <FontAwesomeIcon
            icon={faArrowRight}
            className="h-3 w-3 shrink-0 text-muted-foreground/60"
          />
          <span
            className="truncate font-medium text-foreground"
            title={generated}
          >
            {generated}
          </span>
        </>
      )}
    </div>
  );
}

function LongDiff({
  current,
  generated,
  expanded,
  onToggleExpand,
}: {
  current: string;
  generated: string;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const generatedIsEmpty = generated === EMPTY;
  const showToggle = current.length > 180 || generated.length > 180;
  return (
    <div className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Pane label="Current" value={current} tone="muted" expanded={expanded} />
        <Pane
          label="AI suggestion"
          value={generated}
          tone={generatedIsEmpty ? "muted" : "accent"}
          expanded={expanded}
        />
      </div>
      {showToggle && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <FontAwesomeIcon
            icon={faChevronDown}
            className={`h-2.5 w-2.5 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
          {expanded ? "Collapse" : "Show full"}
        </button>
      )}
    </div>
  );
}

function Pane({
  label,
  value,
  tone,
  expanded,
}: {
  label: string;
  value: string;
  tone: "muted" | "accent";
  expanded: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-2.5 text-xs leading-relaxed ${
        tone === "accent"
          ? "border-primary/30 bg-primary/5"
          : "border-border/60 bg-muted/30 text-muted-foreground"
      }`}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`whitespace-pre-wrap break-words ${
          expanded ? "" : "line-clamp-4"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
