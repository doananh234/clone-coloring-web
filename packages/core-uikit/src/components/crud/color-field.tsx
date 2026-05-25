import React from "react";
import { Input } from "../ui/input";
import { cn } from "../../utils/cn";

type ColorFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function ColorField({ value, onChange, error }: ColorFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-8 w-8 shrink-0 rounded border"
        style={{ backgroundColor: value || "#000000" }}
      />
      <Input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className={cn("flex-1", error && "border-destructive")}
      />
      <input
        type="color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
      />
    </div>
  );
}
