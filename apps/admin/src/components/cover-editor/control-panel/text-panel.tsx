"use client";
import React from "react";
import { Label } from "@vx/core-uikit/components";
import { Input } from "@vx/core-uikit/components";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@vx/core-uikit/components";
import { FONT_CATALOG } from "@vx/server-core/text-overlay";
import type { SlotName, SlotState } from "../types";

interface TextPanelProps {
  slots: Record<SlotName, SlotState>;
  onSlotText: (slot: SlotName, text: string) => void;
  onSlotStyle: (slot: SlotName, patch: Partial<Omit<SlotState, "text">>) => void;
}

const SLOT_LABELS: Record<SlotName, string> = {
  title: "Title",
  subtitle: "Subtitle",
  brand: "Brand / byline",
};

const SLOT_ORDER: SlotName[] = ["title", "subtitle", "brand"];

export function TextPanel({ slots, onSlotText, onSlotStyle }: TextPanelProps) {
  return (
    <div className="space-y-6">
      {SLOT_ORDER.map((slot) => (
        <SlotEditor
          key={slot}
          slot={slot}
          label={SLOT_LABELS[slot]}
          state={slots[slot]}
          onText={(t) => onSlotText(slot, t)}
          onStyle={(patch) => onSlotStyle(slot, patch)}
        />
      ))}
    </div>
  );
}

interface SlotEditorProps {
  slot: SlotName;
  label: string;
  state: SlotState;
  onText: (text: string) => void;
  onStyle: (patch: Partial<Omit<SlotState, "text">>) => void;
}

function SlotEditor({ slot, label, state, onText, onStyle }: SlotEditorProps) {
  return (
    <div className="space-y-2 border rounded-md p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold uppercase tracking-wide">{label}</Label>
      </div>
      <Input
        value={state.text}
        onChange={(e) => onText(e.target.value)}
        placeholder={`${label} text`}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Font</Label>
          <Select value={state.fontFamily} onValueChange={(v) => onStyle({ fontFamily: v ?? state.fontFamily })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_CATALOG.map((f) => (
                <SelectItem key={f.id} value={f.family}>
                  {f.family}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Color</Label>
          <Input
            type="color"
            value={state.color}
            onChange={(e) => onStyle({ color: e.target.value })}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] text-muted-foreground">Size ({state.fontSize}px)</Label>
          <Input
            type="range"
            min={12}
            max={200}
            step={1}
            value={state.fontSize}
            onChange={(e) => onStyle({ fontSize: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
