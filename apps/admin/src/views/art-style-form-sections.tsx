"use client";

import { useState, useRef, useEffect } from "react";
import { Input, Textarea, Card, CardContent } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/pro-regular-svg-icons";
import type { ArtStyleEntity } from "@/lib/ai/art-style-types";
import {
  STROKE_WEIGHT_MIN,
  STROKE_WEIGHT_MAX,
  STROKE_WEIGHT_STEP,
  LINE_QUALITY_OPTIONS,
  LINE_VARIATION_OPTIONS,
  OUTLINE_STYLE_OPTIONS,
  HATCHING_PATTERN_OPTIONS,
  DENSITY_OPTIONS,
  SYMMETRY_OPTIONS,
  FRAMING_STYLE_OPTIONS,
  NEGATIVE_SPACE_OPTIONS,
  FOCAL_POINT_OPTIONS,
  SHAPE_LANGUAGE_OPTIONS,
  EDGE_TREATMENT_OPTIONS,
  PROPORTION_STYLE_OPTIONS,
  DETAIL_LEVEL_OPTIONS,
  ENERGY_LEVEL_OPTIONS,
  AGE_TARGET_OPTIONS,
  FILL_PATTERN_OPTIONS,
  BACKGROUND_TREATMENT_OPTIONS,
  DECORATIVE_ELEMENTS_OPTIONS,
  BORDER_STYLE_OPTIONS,
  ORIENTATION_OPTIONS,
  COLORING_TIME_OPTIONS,
} from "@/lib/ai/art-style-types";

type FormData = Omit<ArtStyleEntity, "id" | "createdAt" | "updatedAt">;

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

// --- Property Group Card ---

type FieldDef = {
  name: string;
  type: "suggest" | "input" | "number";
  suggestions?: readonly string[];
  min?: number;
  max?: number;
  step?: number;
};

function PropertyGroupCard({
  title,
  group,
  fields,
  formData,
  updateGroup,
}: {
  title: string;
  group: keyof FormData;
  fields: FieldDef[];
  formData: FormData;
  updateGroup: (group: string, field: string, value: unknown) => void;
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
            ) : f.type === "number" ? (
              <div key={f.name}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block capitalize">
                  {f.name.replace(/([A-Z])/g, " $1").trim()}
                </label>
                <Input
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={String(groupData[f.name] ?? "")}
                  onChange={(e) => updateGroup(group, f.name, Number(e.target.value))}
                  className="h-8"
                />
              </div>
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

// --- All property sections config ---

const PROPERTY_SECTIONS: { title: string; group: keyof FormData; fields: FieldDef[] }[] = [
  {
    title: "Line Work",
    group: "lineWork",
    fields: [
      {
        name: "strokeWeight",
        type: "number",
        min: STROKE_WEIGHT_MIN,
        max: STROKE_WEIGHT_MAX,
        step: STROKE_WEIGHT_STEP,
      },
      { name: "lineQuality", type: "suggest", suggestions: LINE_QUALITY_OPTIONS },
      { name: "lineVariation", type: "suggest", suggestions: LINE_VARIATION_OPTIONS },
      { name: "outlineStyle", type: "suggest", suggestions: OUTLINE_STYLE_OPTIONS },
      { name: "hatchingPattern", type: "suggest", suggestions: HATCHING_PATTERN_OPTIONS },
    ],
  },
  {
    title: "Composition",
    group: "composition",
    fields: [
      { name: "density", type: "suggest", suggestions: DENSITY_OPTIONS },
      { name: "symmetry", type: "suggest", suggestions: SYMMETRY_OPTIONS },
      { name: "framingStyle", type: "suggest", suggestions: FRAMING_STYLE_OPTIONS },
      { name: "negativeSpace", type: "suggest", suggestions: NEGATIVE_SPACE_OPTIONS },
      { name: "focalPoint", type: "suggest", suggestions: FOCAL_POINT_OPTIONS },
    ],
  },
  {
    title: "Form & Shape",
    group: "formAndShape",
    fields: [
      { name: "shapeLanguage", type: "suggest", suggestions: SHAPE_LANGUAGE_OPTIONS },
      { name: "edgeTreatment", type: "suggest", suggestions: EDGE_TREATMENT_OPTIONS },
      { name: "proportionStyle", type: "suggest", suggestions: PROPORTION_STYLE_OPTIONS },
      { name: "detailLevel", type: "suggest", suggestions: DETAIL_LEVEL_OPTIONS },
    ],
  },
  {
    title: "Mood & Atmosphere",
    group: "moodAndAtmosphere",
    fields: [
      { name: "mood", type: "input" },
      { name: "energyLevel", type: "suggest", suggestions: ENERGY_LEVEL_OPTIONS },
      { name: "ageTarget", type: "suggest", suggestions: AGE_TARGET_OPTIONS },
      { name: "themeCategory", type: "input" },
    ],
  },
  {
    title: "Pattern & Texture",
    group: "patternAndTexture",
    fields: [
      { name: "fillPattern", type: "suggest", suggestions: FILL_PATTERN_OPTIONS },
      { name: "backgroundTreatment", type: "suggest", suggestions: BACKGROUND_TREATMENT_OPTIONS },
      { name: "decorativeElements", type: "suggest", suggestions: DECORATIVE_ELEMENTS_OPTIONS },
      { name: "borderStyle", type: "suggest", suggestions: BORDER_STYLE_OPTIONS },
    ],
  },
  {
    title: "Technical",
    group: "technical",
    fields: [
      { name: "orientation", type: "suggest", suggestions: ORIENTATION_OPTIONS },
      { name: "complexityScore", type: "number", min: 1, max: 10 },
      { name: "estimatedColoringTime", type: "suggest", suggestions: COLORING_TIME_OPTIONS },
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
