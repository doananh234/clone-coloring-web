"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Badge,
} from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faSquare, faSquareCheck } from "@fortawesome/pro-regular-svg-icons";
import type { BookMetaGenerationResult } from "@/lib/ai/prompts/book-meta-prompt";

type FieldEntry = {
  key: string;
  label: string;
  currentValue: string;
  generatedValue: string;
  section: "general" | "discovery" | "etsy";
};

type BookMetaPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatedData: BookMetaGenerationResult;
  currentData: Record<string, unknown>;
  onApply: (selected: Record<string, unknown>) => void;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
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
  const generalFields = [
    { key: "title", genPath: "title", curPath: "title" },
    { key: "subtitle", genPath: "subtitle", curPath: "subtitle" },
    { key: "description", genPath: "description", curPath: "description" },
    { key: "badge", genPath: "badge", curPath: "badge" },
    { key: "categoryId", genPath: "categoryId", curPath: "categoryId" },
    { key: "category", genPath: "category", curPath: "category" },
    { key: "price", genPath: "price", curPath: "price" },
    { key: "ageRange", genPath: "ageRange", curPath: "specifications.ageRange" },
    { key: "dimensions", genPath: "dimensions", curPath: "specifications.dimensions" },
    { key: "backgroundColor", genPath: "backgroundColor", curPath: "backgroundColor" },
  ];

  const discoveryFields = [
    { key: "tags", genPath: "tags", curPath: "tags" },
    { key: "primaryColor", genPath: "primaryColor", curPath: "primaryColor" },
    { key: "secondaryColor", genPath: "secondaryColor", curPath: "secondaryColor" },
    { key: "themeStyle", genPath: "themeStyle", curPath: "themeStyle" },
    { key: "holiday", genPath: "holiday", curPath: "holiday" },
    { key: "occasion", genPath: "occasion", curPath: "occasion" },
  ];

  const etsyFields = [
    { key: "etsyTitle", genPath: "etsyListing.etsyTitle", curPath: "etsyListing.etsyTitle" },
    { key: "etsyDescription", genPath: "etsyListing.etsyDescription", curPath: "etsyListing.etsyDescription" },
    { key: "materials", genPath: "etsyListing.materials", curPath: "etsyListing.materials" },
    { key: "etsyCategory", genPath: "etsyListing.etsyCategory", curPath: "etsyListing.etsyCategory" },
    { key: "subcategory", genPath: "etsyListing.subcategory", curPath: "etsyListing.subcategory" },
    { key: "priceSuggestionUsd", genPath: "etsyListing.priceSuggestionUsd", curPath: "etsyListing.priceSuggestionUsd" },
    { key: "priceNotes", genPath: "etsyListing.priceNotes", curPath: "etsyListing.priceNotes" },
    { key: "section", genPath: "etsyListing.section", curPath: "etsyListing.section" },
  ];

  function mapFields(
    fields: Array<{ key: string; genPath: string; curPath: string }>,
    section: FieldEntry["section"],
  ): FieldEntry[] {
    return fields.map(({ key, genPath, curPath }) => ({
      key,
      label: t(`fields.${key}`),
      currentValue: formatValue(getNestedValue(current, curPath)),
      generatedValue: formatValue(getNestedValue(generated, genPath)),
      section,
    }));
  }

  return [
    ...mapFields(generalFields, "general"),
    ...mapFields(discoveryFields, "discovery"),
    ...mapFields(etsyFields, "etsy"),
  ];
}

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
    () => new Set(fields.map((f) => f.key)),
  );

  function toggleField(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(fields.map((f) => f.key)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  // Fields that map from AI top-level to nested form paths
  const NESTED_FIELD_MAP: Record<string, string> = {
    ageRange: "specifications.ageRange",
    dimensions: "specifications.dimensions",
  };

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

  const sections: Array<{ key: string; label: string; filter: FieldEntry["section"] }> = [
    { key: "general", label: t("generateMeta.generalSection"), filter: "general" },
    { key: "discovery", label: t("generateMeta.discoverySection"), filter: "discovery" },
    { key: "etsy", label: t("generateMeta.etsySection"), filter: "etsy" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("generateMeta.previewTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-2">
          <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
            {t("generateMeta.selectAll")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={deselectAll}>
            {t("generateMeta.deselectAll")}
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">
            {selected.size}/{fields.length}
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((section) => {
            const sectionFields = fields.filter((f) => f.section === section.filter);
            return (
              <div key={section.key}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {section.label}
                </h3>
                <div className="space-y-1">
                  {sectionFields.map((field) => {
                    const isSelected = selected.has(field.key);
                    const isLongText = field.key === "etsyDescription" || field.key === "description";
                    return (
                      <div
                        key={field.key}
                        className={`grid cursor-pointer rounded-md border p-2 transition-colors ${
                          isSelected
                            ? "border-primary/30 bg-primary/5"
                            : "border-transparent bg-muted/30"
                        } ${isLongText ? "grid-cols-1" : "grid-cols-[auto_1fr_1fr]"} gap-2 items-start`}
                        onClick={() => toggleField(field.key)}
                      >
                        <div className="flex items-center pt-0.5">
                          <FontAwesomeIcon
                            icon={isSelected ? faSquareCheck : faSquare}
                            className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                          />
                        </div>

                        {isLongText ? (
                          <div className="space-y-2">
                            <div className="text-xs font-medium">{field.label}</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Badge variant="outline" className="mb-1 text-[10px]">
                                  {t("generateMeta.currentValue")}
                                </Badge>
                                <div className="max-h-32 overflow-y-auto rounded bg-muted/50 p-2 text-xs">
                                  {field.currentValue}
                                </div>
                              </div>
                              <div>
                                <Badge variant="default" className="mb-1 text-[10px]">
                                  {t("generateMeta.generatedValue")}
                                </Badge>
                                <div className="max-h-32 overflow-y-auto rounded bg-primary/5 p-2 text-xs">
                                  {field.generatedValue}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <div className="text-xs font-medium">{field.label}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground truncate max-w-[200px]">
                                {field.currentValue}
                              </div>
                            </div>
                            <div>
                              <div className="mt-0.5 text-xs font-medium text-primary truncate">
                                {field.generatedValue}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={selected.size === 0}>
            <FontAwesomeIcon icon={faCheck} className="mr-1.5 h-3.5 w-3.5" />
            {t("generateMeta.applySelected")} ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
