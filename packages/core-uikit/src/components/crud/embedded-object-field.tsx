import React from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { FieldConfig } from "../../generators/types";

type EmbeddedObjectFieldProps = {
  subFields: FieldConfig[];
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  fieldLabels?: Record<string, string>;
};

export function EmbeddedObjectField({
  subFields,
  value,
  onChange,
  fieldLabels,
}: EmbeddedObjectFieldProps) {
  const current = value ?? {};

  function handleSubFieldChange(fieldName: string, fieldValue: unknown) {
    onChange({ ...current, [fieldName]: fieldValue });
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      {subFields.map((sub) => {
        const label = fieldLabels?.[sub.name] ?? sub.label;
        const subValue = current[sub.name] ?? "";

        return (
          <div key={sub.name} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
              type={sub.type === "number" ? "number" : "text"}
              value={String(subValue)}
              onChange={(e) =>
                handleSubFieldChange(
                  sub.name,
                  sub.type === "number" ? Number(e.target.value) : e.target.value,
                )
              }
            />
          </div>
        );
      })}
    </div>
  );
}
