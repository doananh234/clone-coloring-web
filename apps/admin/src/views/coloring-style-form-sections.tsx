"use client";

import { useState, useRef, useEffect } from "react";
import { Input, Textarea, Card, CardContent } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/pro-regular-svg-icons";
import type { ColoringStyleEntity } from "@/lib/ai/coloring-style-types";
import {
  TECHNIQUE_OPTIONS,
  TEXTURE_OPTIONS,
  BACKGROUND_TONE_OPTIONS,
  WARMTH_OPTIONS,
  SATURATION_OPTIONS,
  SHADING_STYLE_OPTIONS,
  LIGHT_DIRECTION_OPTIONS,
  HIGHLIGHT_TREATMENT_OPTIONS,
  SHADOW_COLOR_OPTIONS,
  EDGE_BLEED_OPTIONS,
  OPACITY_OPTIONS,
  COVERAGE_OPTIONS,
  MOOD_OPTIONS,
  AGE_FEEL_OPTIONS,
  FINISH_OPTIONS,
} from "@/lib/ai/coloring-style-types";

type FormData = Omit<ColoringStyleEntity, "id" | "createdAt" | "updatedAt">;

// --- Autocomplete Combobox ---
// Shows suggestions from predefined options but accepts any custom text value

function SuggestInput({
  label,
  value,
  suggestions,
  onChange,
}: {
  label: string;
  value: string;
  suggestions: readonly string[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = suggestions.filter((s) => s.toLowerCase().includes(inputValue.toLowerCase()));

  return (
    <div ref={wrapperRef} className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block capitalize">
        {label.replace(/([A-Z])/g, " $1").trim()}
      </label>
      <Input
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="h-8"
        placeholder={`Type or select...`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`w-full px-2 py-1.5 text-left text-sm hover:bg-muted ${opt === value ? "bg-muted font-medium" : ""}`}
              onClick={() => {
                setInputValue(opt);
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Color Chips Input ---
// For primaryColors and accentColors — color picker chips with add/remove

export function ColorChipsInput({
  label,
  colors,
  onChange,
}: {
  label: string;
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <div className="flex flex-wrap gap-1.5 items-center">
        {colors.map((color, i) => (
          <div key={i} className="relative group">
            <input
              type="color"
              value={color}
              onChange={(e) => {
                const next = [...colors];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="h-8 w-8 cursor-pointer rounded border p-0.5"
            />
            <button
              type="button"
              onClick={() => onChange(colors.filter((_, j) => j !== i))}
              className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...colors, "#cccccc"])}
          className="h-8 w-8 rounded border-2 border-dashed text-muted-foreground text-lg flex items-center justify-center hover:border-primary/50"
        >
          +
        </button>
      </div>
    </div>
  );
}

// --- Property Group Card ---

type FieldDef = {
  name: string;
  type: "suggest" | "input";
  suggestions?: readonly string[];
};

function PropertyGroupCard({
  title,
  group,
  fields,
  formData,
  updateGroup,
  extraContent,
}: {
  title: string;
  group: keyof FormData;
  fields: FieldDef[];
  formData: FormData;
  updateGroup: (group: string, field: string, value: unknown) => void;
  extraContent?: React.ReactNode;
}) {
  const groupData = formData[group] as unknown as Record<string, unknown>;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fields.map((f) =>
            f.type === "suggest" && f.suggestions ? (
              <SuggestInput
                key={f.name}
                label={f.name}
                value={String(groupData[f.name] ?? "")}
                suggestions={f.suggestions}
                onChange={(val) => updateGroup(group, f.name, val)}
              />
            ) : (
              <div key={f.name}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block capitalize">
                  {f.name.replace(/([A-Z])/g, " $1").trim()}
                </label>
                <Input
                  value={String(groupData[f.name] ?? "")}
                  onChange={(e) => updateGroup(group, f.name, e.target.value)}
                  className="h-8"
                />
              </div>
            ),
          )}
        </div>
        {extraContent}
        <Textarea
          rows={2}
          placeholder={`${title} description...`}
          value={String(groupData.description ?? "")}
          onChange={(e) => updateGroup(group, "description", e.target.value)}
        />
      </CardContent>
    </Card>
  );
}

// --- All property sections config (5 groups) ---

const PROPERTY_SECTIONS: {
  title: string;
  group: keyof FormData;
  fields: FieldDef[];
}[] = [
  {
    title: "Medium",
    group: "medium",
    fields: [
      { name: "technique", type: "suggest", suggestions: TECHNIQUE_OPTIONS },
      { name: "texture", type: "suggest", suggestions: TEXTURE_OPTIONS },
    ],
  },
  {
    title: "Color Palette",
    group: "colorPalette",
    fields: [
      { name: "backgroundTone", type: "suggest", suggestions: BACKGROUND_TONE_OPTIONS },
      { name: "warmth", type: "suggest", suggestions: WARMTH_OPTIONS },
      { name: "saturation", type: "suggest", suggestions: SATURATION_OPTIONS },
    ],
  },
  {
    title: "Shading & Lighting",
    group: "shadingAndLighting",
    fields: [
      { name: "shadingStyle", type: "suggest", suggestions: SHADING_STYLE_OPTIONS },
      { name: "lightDirection", type: "suggest", suggestions: LIGHT_DIRECTION_OPTIONS },
      { name: "highlightTreatment", type: "suggest", suggestions: HIGHLIGHT_TREATMENT_OPTIONS },
      { name: "shadowColorTendency", type: "suggest", suggestions: SHADOW_COLOR_OPTIONS },
    ],
  },
  {
    title: "Fill Behavior",
    group: "fillBehavior",
    fields: [
      { name: "edgeBleed", type: "suggest", suggestions: EDGE_BLEED_OPTIONS },
      { name: "opacity", type: "suggest", suggestions: OPACITY_OPTIONS },
      { name: "coverage", type: "suggest", suggestions: COVERAGE_OPTIONS },
    ],
  },
  {
    title: "Overall Feel",
    group: "overallFeel",
    fields: [
      { name: "mood", type: "suggest", suggestions: MOOD_OPTIONS },
      { name: "ageFeel", type: "suggest", suggestions: AGE_FEEL_OPTIONS },
      { name: "finish", type: "suggest", suggestions: FINISH_OPTIONS },
    ],
  },
];

// --- Exported sections renderer ---

export function PropertyGroupSections({
  formData,
  updateGroup,
}: {
  formData: FormData;
  updateGroup: (group: string, field: string, value: unknown) => void;
}) {
  return (
    <>
      {PROPERTY_SECTIONS.map((section) => (
        <PropertyGroupCard
          key={section.group}
          title={section.title}
          group={section.group}
          fields={section.fields}
          formData={formData}
          updateGroup={updateGroup}
          extraContent={
            section.group === "colorPalette" ? (
              <div className="grid grid-cols-2 gap-3">
                <ColorChipsInput
                  label="Primary Colors"
                  colors={(formData.colorPalette?.primaryColors as string[]) ?? []}
                  onChange={(colors) => updateGroup("colorPalette", "primaryColors", colors)}
                />
                <ColorChipsInput
                  label="Accent Colors"
                  colors={(formData.colorPalette?.accentColors as string[]) ?? []}
                  onChange={(colors) => updateGroup("colorPalette", "accentColors", colors)}
                />
              </div>
            ) : undefined
          }
        />
      ))}
    </>
  );
}

// --- Image upload section ---

export function ReferenceImageSection({
  imageFiles,
  onAdd,
  onRemove,
}: {
  imageFiles: string[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Reference Images</h3>
        <div className="flex gap-3 flex-wrap">
          {imageFiles.map((url, i) => (
            <div key={i} className="relative h-24 w-24 rounded-lg border overflow-hidden group">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
              </button>
            </div>
          ))}
          {imageFiles.length < 3 && (
            <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground hover:border-primary/50 transition-colors">
              <span className="text-2xl">+</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && onAdd(e.target.files)}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Upload up to 3 reference images</p>
      </CardContent>
    </Card>
  );
}
