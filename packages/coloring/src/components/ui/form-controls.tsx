"use client";

import { useRef, useState, type ReactNode } from "react";
import { Icon } from "../../lib/icon";

/* ---- Select ---- */
export interface SelectOption {
  label: string;
  value: string;
}
export interface SelectProps {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: (string | SelectOption)[];
  placeholder?: string;
}
function norm(o: string | SelectOption): SelectOption {
  return typeof o === "string" ? { label: o, value: o } : o;
}
export function Select({ label, value, onChange, options, placeholder }: SelectProps) {
  const field = (
    <select className="mo-input" value={value ?? ""} onChange={(e) => onChange?.(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(norm).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
  if (!label) return field;
  return (
    <label style={{ display: "block" }}>
      <span className="mo-flabel">{label}</span>
      {field}
    </label>
  );
}

/* ---- RadioGroup ---- */
export interface RadioOption {
  value: string;
  label: string;
  sub?: string;
}
export interface RadioGroupProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
}
export function RadioGroup({ label, value, onChange, options }: RadioGroupProps) {
  return (
    <div>
      {label && <span className="mo-flabel">{label}</span>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((o) => (
          <div
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            tabIndex={0}
            className={`mo-radio-opt${value === o.value ? " mo-radio-opt--on" : ""}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(o.value)}
          >
            <span className="mo-radio-dot" />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{o.label}</span>
              {o.sub && <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{o.sub}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Switch ---- */
export interface SwitchProps {
  label?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}
export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      className="mo-switch"
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(!checked)}
    >
      <span className={`mo-switch__track${checked ? " mo-switch__track--on" : ""}`}>
        <span className="mo-switch__thumb" />
      </span>
      {label}
    </span>
  );
}

/* ---- Slider ---- */
export interface SliderProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}
export function Slider({ label, value, min = 0, max = 100, step = 1, unit = "", onChange }: SliderProps) {
  const field = (
    <input
      type="range"
      className="mo-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
  if (!label) return field;
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="mo-flabel">{label}</span>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>{value}{unit}</span>
      </span>
      {field}
    </label>
  );
}

/* ---- FileUpload (local only — captures filename, never uploads) ---- */
export interface FileUploadProps {
  accept?: string;
  hint?: string;
  onFile?: (file: File) => void;
}
export function FileUpload({ accept, hint, onFile }: FileUploadProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string>("");
  return (
    <div
      className={`mo-drop${name ? " mo-drop--filled" : ""}`}
      onClick={() => ref.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
    >
      <Icon name={name ? "file-text" : "image"} size={22} />
      <div style={{ fontSize: 13, fontWeight: 600 }}>{name || "Kéo thả hoặc bấm để chọn file"}</div>
      {hint && !name && <div style={{ fontSize: 12 }}>{hint}</div>}
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setName(f.name);
            onFile?.(f);
          }
        }}
      />
    </div>
  );
}
