"use client";

import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Icon } from "../../lib/icon";
import { Select, Slider } from "../../components/ui/form-controls";
import { FontPicker } from "./font-picker";
import { ELEMENT_ORDER, ELEMENT_LABELS, type CoverDoc, type CoverElement, type CoverElementKey } from "../../lib/cover-doc";

const SWATCHES = ["#1a1712", "#8a8070", "#c9852a", "#ffffff", "#dd5245", "#4e8ff2", "#0b0d0c"];
const WEIGHTS = [{ label: "Thường", value: "400" }, { label: "Vừa", value: "500" }, { label: "Đậm vừa", value: "600" }, { label: "Đậm", value: "700" }];
const ALIGNS: { key: CoverElement["textAlign"]; icon: string }[] = [
  { key: "left", icon: "align-left" }, { key: "center", icon: "align-center" }, { key: "right", icon: "align-right" },
];

export interface CoverElementPanelProps {
  doc: CoverDoc;
  selectedKey: CoverElementKey | null;
  onSelect: (k: CoverElementKey) => void;
  onPatch: (k: CoverElementKey, patch: Partial<CoverElement>) => void;
}

export function CoverElementPanel({ doc, selectedKey, onSelect, onPatch }: CoverElementPanelProps) {
  const key = selectedKey ?? "title";
  const el = doc.elements[key];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Các lớp chữ">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ELEMENT_ORDER.map((k) => {
            const e = doc.elements[k];
            const on = k === key;
            return (
              <div key={k} onClick={() => onSelect(k)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer", background: on ? "var(--neutral-100)" : "transparent", border: `1px solid ${on ? "var(--border)" : "transparent"}` }}>
                <button type="button" onClick={(ev) => { ev.stopPropagation(); onPatch(k, { visible: !e.visible }); }}
                  title={e.visible ? "Ẩn" : "Hiện"} style={{ background: "none", border: "none", cursor: "pointer", color: e.visible ? "var(--foreground)" : "var(--muted-foreground)", padding: 0 }}>
                  <Icon name={e.visible ? "eye" : "eye-off"} size={16} />
                </button>
                <span style={{ fontSize: 13, fontWeight: on ? 600 : 500, flex: 1, opacity: e.visible ? 1 : 0.5 }}>{ELEMENT_LABELS[k]}</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text || "—"}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={`Chỉnh: ${ELEMENT_LABELS[key]}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={{ display: "block" }}><span className="mo-flabel">Nội dung</span>
            <Input value={el.text} onChange={(e) => onPatch(key, { text: e.target.value })} /></label>
          <FontPicker value={el.fontFamily} onChange={(v) => onPatch(key, { fontFamily: v })} />
          <Select label="Độ đậm" value={String(el.fontWeight)} onChange={(v) => onPatch(key, { fontWeight: Number(v) as CoverElement["fontWeight"] })} options={WEIGHTS} />
          <Slider label="Cỡ chữ" value={el.fontSize} min={16} max={220} unit=" px" onChange={(v) => onPatch(key, { fontSize: v })} />
          <Slider label="Giãn chữ" value={el.letterSpacing} min={-10} max={40} unit=" px" onChange={(v) => onPatch(key, { letterSpacing: v })} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Canh lề</div>
            <div style={{ display: "flex", gap: 6 }}>
              {ALIGNS.map((a) => (
                <button key={a.key} type="button" onClick={() => onPatch(key, { textAlign: a.key })}
                  style={{ flex: 1, padding: "6px 0", borderRadius: "var(--radius-sm)", border: `1px solid var(--border)`, background: el.textAlign === a.key ? "var(--neutral-100)" : "transparent", cursor: "pointer", display: "flex", justifyContent: "center" }}>
                  <Icon name={a.icon} size={16} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Màu chữ</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {SWATCHES.map((c) => (
                <span key={c} className={`mo-swatch${el.color.toLowerCase() === c ? " mo-swatch--on" : ""}`}
                  style={{ background: c, borderColor: c === "#ffffff" ? "var(--neutral-300)" : undefined }} onClick={() => onPatch(key, { color: c })} />
              ))}
              <input type="color" className="mo-colorpick" value={/^#[0-9a-fA-F]{6}$/.test(el.color) ? el.color : "#0b0d0c"} onChange={(e) => onPatch(key, { color: e.target.value })} />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
