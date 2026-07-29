"use client";

import { useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../lib/icon";
import { useFonts } from "../../data/use-fonts";

const BUILTIN = ["Space Grotesk", "Fredoka", "Baloo 2", "Quicksand", "Poppins", "Nunito", "Chewy", "Pacifico", "Fraunces", "Geist", "Geist Mono"];

export interface FontPickerProps {
  value: string;
  onChange: (family: string) => void;
}

export function FontPicker({ value, onChange }: FontPickerProps) {
  const { fonts, upload, enabled } = useFonts();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploaded = fonts.map((f) => f.name);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const name = file.name.replace(/\.(woff2|ttf|otf)$/i, "").replace(/[-_]+/g, " ").trim() || "Font";
      await upload(file, name);
      onChange(name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload font thất bại.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="mo-flabel">Font</span>
      <div style={{ display: "flex", gap: 8 }}>
        <select className="mo-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, fontFamily: value }}>
          <optgroup label="Có sẵn">
            {BUILTIN.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </optgroup>
          {uploaded.length > 0 && (
            <optgroup label="Font đã tải lên">
              {uploaded.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </optgroup>
          )}
          {!BUILTIN.includes(value) && !uploaded.includes(value) && <option value={value}>{value}</option>}
        </select>
        <Button variant="outline" size="sm" disabled={!enabled || uploading} onClick={() => fileRef.current?.click()} title="Tải font lên">
          <Icon name="upload" size={15} /> {uploading ? "…" : "Font"}
        </Button>
        <input ref={fileRef} type="file" accept=".woff2,.ttf,.otf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {err && <span style={{ fontSize: 12, color: "var(--danger)" }}>{err}</span>}
    </div>
  );
}
