import React from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faTrash, faPlus } from "@fortawesome/pro-regular-svg-icons";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import type { FieldConfig } from "../../generators/types";

type NestedArrayFieldProps = {
  subFields: FieldConfig[];
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
  readOnly?: boolean;
  fieldLabels?: Record<string, string>;
};

export function NestedArrayField({
  subFields,
  value,
  onChange,
  readOnly,
  fieldLabels,
}: NestedArrayFieldProps) {
  const { t } = useTranslation("common");
  const items = value ?? [];

  function handleAdd() {
    const newItem: Record<string, unknown> = { id: crypto.randomUUID() };
    for (const sub of subFields) {
      newItem[sub.name] = sub.type === "boolean" ? false : "";
    }
    onChange([...items, newItem]);
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function handleFieldChange(index: number, fieldName: string, fieldValue: unknown) {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [fieldName]: fieldValue } : item,
    );
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={(item.id as string) ?? index}
          className="flex items-start gap-2 rounded-md border p-2"
        >
          {!readOnly && (
            <FontAwesomeIcon
              icon={faGripVertical}
              className="mt-2 h-4 w-4 shrink-0 text-muted-foreground"
            />
          )}
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            {subFields.map((sub) => {
              const label = fieldLabels?.[sub.name] ?? sub.label;

              if (sub.type === "boolean") {
                return (
                  <label key={sub.name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!item[sub.name]}
                      disabled={readOnly}
                      onCheckedChange={(checked) => handleFieldChange(index, sub.name, checked)}
                    />
                    {label}
                  </label>
                );
              }

              return (
                <Input
                  key={sub.name}
                  type="text"
                  placeholder={label}
                  value={String(item[sub.name] ?? "")}
                  readOnly={readOnly}
                  onChange={(e) => handleFieldChange(index, sub.name, e.target.value)}
                />
              );
            })}
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 shrink-0"
              onClick={() => handleRemove(index)}
            >
              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
          <FontAwesomeIcon icon={faPlus} className="mr-1 h-4 w-4" />
          {t("add")}
        </Button>
      )}
    </div>
  );
}
