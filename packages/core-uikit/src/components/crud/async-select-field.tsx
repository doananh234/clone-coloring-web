import React, { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "../../utils/cn";

interface AsyncSelectFieldProps {
  url: string;
  valueField?: string;
  labelField?: string;
  value: string;
  placeholder?: string;
  onChange: (val: string) => void;
  error?: boolean;
}

type ApiResponse = { data?: unknown } | unknown[];

/**
 * Select whose options come from an API endpoint (`GET url`). Response shape
 * tolerated: `{ data: T[] }` (paginated envelope) or a bare `T[]` array. Each
 * item's value defaults to its `id`, label to `name` (falls back to
 * `displayName`, then the raw id).
 */
export function AsyncSelectField({
  url,
  valueField = "id",
  labelField,
  value,
  placeholder,
  onChange,
  error,
}: AsyncSelectFieldProps) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((res) => res.json())
      .then((json: ApiResponse) => {
        if (cancelled) return;
        const rawItems: unknown[] = Array.isArray(json)
          ? json
          : Array.isArray((json as { data?: unknown }).data)
            ? ((json as { data: unknown[] }).data)
            : [];
        const mapped = rawItems
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const rec = item as Record<string, unknown>;
            const val = rec[valueField];
            if (typeof val !== "string") return null;
            const explicitLabel = labelField ? rec[labelField] : undefined;
            const label =
              (typeof explicitLabel === "string" && explicitLabel) ||
              (typeof rec.name === "string" && rec.name) ||
              (typeof rec.displayName === "string" && rec.displayName) ||
              val;
            return { value: val, label };
          })
          .filter((x): x is { value: string; label: string } => x !== null);
        setOptions(mapped);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, valueField, labelField]);

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className={cn(error && "border-destructive")}>
        <SelectValue
          placeholder={loading ? "Loading…" : placeholder || "Select an option"}
        />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
