"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Label } from "@vx/core-uikit/components";
import { ArtStylePicker } from "@/components/art-style-picker";
import type { ArtStyleEntity } from "@/lib/ai/art-style-types";
import { notify } from "@vx/core-uikit/notifications";
import { cn } from "@vx/core-uikit/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faSparkles,
  faRotate,
  faXmark,
  faChevronDown,
  faChevronUp,
  faUsers,
  faMapPin,
} from "@fortawesome/pro-regular-svg-icons";

// --- Types ---

export interface PickedCharacter {
  id: string;
  name: string;
  characterPrompt: string;
  referenceImageUrl?: string;
}

export interface PickedLocation {
  id: string;
  name: string;
  locationPrompt: string;
  referenceImageUrl?: string;
}

export interface StoryOutlineScene {
  sceneNumber: number;
  locationName: string;
  locationModifier: string;
  sceneElements: string[];
  characterNames: string[];
  activity: string;
  mood: string;
  composition: string;
}

export interface ScenePromptData {
  prompt: string;
  characterReferenceImageUrls: string[];
  locationReferenceImageUrls: string[];
}

export interface StoryPlannerResult {
  outline: StoryOutlineScene[];
  prompts: string[];
  scenePrompts: ScenePromptData[];
}

interface CharacterEntity {
  id: string;
  name: string;
  characterPrompt: string;
  referenceImageUrl?: string;
}

interface LocationEntity {
  id: string;
  name: string;
  locationPrompt: string;
  referenceImageUrl?: string;
}

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

// --- Props ---

interface StoryPlannerStepProps {
  title: string;
  description: string;
  onBack: () => void;
  onNext: (prompts: string[], scenePrompts?: ScenePromptData[]) => void;
}

// --- Component ---

export function StoryPlannerStep({ title, description, onBack, onNext }: StoryPlannerStepProps) {
  // Picker state
  const [selectedCharacters, setSelectedCharacters] = useState<PickedCharacter[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<PickedLocation[]>([]);
  const [pageCount, setPageCount] = useState(20);
  const [artStyleId, setArtStyleId] = useState<string | null>(null);
  const [artStyleData, setArtStyleData] = useState<ArtStyleEntity | null>(null);

  // Outline state
  const [storyOutline, setStoryOutline] = useState<StoryOutlineScene[] | null>(null);
  const [outlinePrompts, setOutlinePrompts] = useState<string[]>([]);
  const [scenePrompts, setScenePrompts] = useState<ScenePromptData[]>([]);
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [generatingOutline, setGeneratingOutline] = useState(false);

  // Fetch characters & locations
  const { data: charResult } = useQuery({
    queryKey: ["characters"],
    queryFn: () => fetch("/api/characters").then((r) => r.json()),
  });
  const allCharacters: CharacterEntity[] = charResult?.data ?? [];

  const { data: locResult } = useQuery({
    queryKey: ["locations"],
    queryFn: () => fetch("/api/locations").then((r) => r.json()),
  });
  const allLocations: LocationEntity[] = locResult?.data ?? [];

  // Toggle character selection
  function toggleCharacter(char: CharacterEntity) {
    setSelectedCharacters((prev) => {
      const exists = prev.find((c) => c.id === char.id);
      if (exists) return prev.filter((c) => c.id !== char.id);
      return [
        ...prev,
        {
          id: char.id,
          name: char.name,
          characterPrompt: char.characterPrompt,
          referenceImageUrl: char.referenceImageUrl,
        },
      ];
    });
  }

  // Toggle location selection
  function toggleLocation(loc: LocationEntity) {
    setSelectedLocations((prev) => {
      const exists = prev.find((l) => l.id === loc.id);
      if (exists) return prev.filter((l) => l.id !== loc.id);
      return [
        ...prev,
        {
          id: loc.id,
          name: loc.name,
          locationPrompt: loc.locationPrompt,
          referenceImageUrl: loc.referenceImageUrl,
        },
      ];
    });
  }

  // Generate story outline
  async function handleGenerateOutline() {
    setGeneratingOutline(true);
    try {
      const res = await fetch("/api/generate/story-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          pageCount,
          characters: selectedCharacters.map((c) => ({
            name: c.name,
            characterPrompt: c.characterPrompt,
            referenceImageUrl: c.referenceImageUrl || "",
          })),
          locations: selectedLocations.map((l) => ({
            name: l.name,
            locationPrompt: l.locationPrompt,
            referenceImageUrl: l.referenceImageUrl || "",
          })),
          style: artStyleData?.generationDirective || "cartoon",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStoryOutline(data.outline);
        setOutlinePrompts(data.prompts);
        setScenePrompts(data.scenePrompts || []);
        setOutlineExpanded(true);
        notify.success(`Generated ${data.outline.length}-scene story outline`);
      } else {
        notify.error(data.error || "Failed to generate story outline");
      }
    } catch {
      notify.error("Failed to generate story outline");
    } finally {
      setGeneratingOutline(false);
    }
  }

  const canGenerate = title.trim().length > 0 && pageCount >= 5 && pageCount <= 50;
  const canProceed = outlinePrompts.length > 0;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Story Planner</h2>
      <p className="text-sm text-muted-foreground">
        Select characters, locations, and style. AI generates a story outline with varied scenes.
      </p>

      {/* Character Picker — only show characters with reference images */}
      <PickerSection
        label="Characters"
        icon={<FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5" />}
        items={allCharacters.filter((c) => c.referenceImageUrl)}
        selectedIds={selectedCharacters.map((c) => c.id)}
        onToggle={toggleCharacter}
        onSelectAll={() =>
          setSelectedCharacters(
            allCharacters
              .filter((c) => c.referenceImageUrl)
              .map((c) => ({
                id: c.id,
                name: c.name,
                characterPrompt: c.characterPrompt,
                referenceImageUrl: c.referenceImageUrl,
              })),
          )
        }
        onDeselectAll={() => setSelectedCharacters([])}
        emptyMessage="No characters with reference images — AI will invent them"
        getImageUrl={(c) => resolveUrl(c.referenceImageUrl)}
        getName={(c) => c.name}
      />

      {/* Location Picker — only show locations with reference images */}
      <PickerSection
        label="Locations"
        icon={<FontAwesomeIcon icon={faMapPin} className="h-3.5 w-3.5" />}
        items={allLocations.filter((l) => l.referenceImageUrl)}
        selectedIds={selectedLocations.map((l) => l.id)}
        onToggle={toggleLocation}
        onSelectAll={() =>
          setSelectedLocations(
            allLocations
              .filter((l) => l.referenceImageUrl)
              .map((l) => ({
                id: l.id,
                name: l.name,
                locationPrompt: l.locationPrompt,
                referenceImageUrl: l.referenceImageUrl,
              })),
          )
        }
        onDeselectAll={() => setSelectedLocations([])}
        emptyMessage="No locations with reference images — AI will invent them"
        getImageUrl={(l) => resolveUrl(l.referenceImageUrl)}
        getName={(l) => l.name}
      />

      {/* Page Count & Style */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Page Count</Label>
          <Input
            type="number"
            min={5}
            max={50}
            value={pageCount}
            onChange={(e) => setPageCount(Math.max(5, Math.min(50, Number(e.target.value) || 5)))}
          />
          <p className="text-[10px] text-muted-foreground">5 - 50 pages</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Art Style</Label>
          <ArtStylePicker
            value={artStyleId}
            onChange={(id, data) => {
              setArtStyleId(id);
              setArtStyleData(data);
            }}
          />
        </div>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerateOutline}
        disabled={!canGenerate || generatingOutline}
        className="w-full"
      >
        {generatingOutline ? (
          <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-4 w-4" />
        ) : (
          <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-4 w-4" />
        )}
        {generatingOutline
          ? "Generating Story Outline..."
          : storyOutline
            ? "Regenerate Story Outline"
            : "Generate Story Outline"}
      </Button>

      {/* Outline Preview */}
      {storyOutline && (
        <OutlinePreview
          outline={storyOutline}
          expanded={outlineExpanded}
          onToggle={() => setOutlineExpanded((prev) => !prev)}
        />
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={() => onNext(outlinePrompts, scenePrompts)} disabled={!canProceed}>
          Next →
        </Button>
      </div>
    </div>
  );
}

// --- Picker Section (generic for characters/locations) ---

interface PickerSectionProps<T> {
  label: string;
  icon: React.ReactNode;
  items: T[];
  selectedIds: string[];
  onToggle: (item: T) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  emptyMessage: string;
  getImageUrl: (item: T) => string;
  getName: (item: T) => string;
}

function PickerSection<T extends { id: string }>({
  label,
  icon,
  items,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  emptyMessage,
  getImageUrl,
  getName,
}: PickerSectionProps<T>) {
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <Label className="text-sm font-medium">{label}</Label>
        {selectedIds.length > 0 && (
          <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {selectedIds.length}
          </span>
        )}
        {items.length > 0 && (
          <button
            type="button"
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="ml-auto text-[11px] font-medium text-primary hover:underline"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyMessage}</p>
      ) : (
        <div className="max-h-[180px] overflow-y-auto rounded-lg border p-2">
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
              const selected = selectedIds.includes(item.id);
              const imgUrl = getImageUrl(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggle(item)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-all",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/30 hover:bg-muted/50",
                  )}
                >
                  {imgUrl ? (
                    <img src={imgUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground">
                      {getName(item).charAt(0)}
                    </div>
                  )}
                  <span className={cn("font-medium", selected && "text-primary")}>
                    {getName(item)}
                  </span>
                  {selected && (
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3 text-primary/60" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Outline Preview Table ---

interface OutlinePreviewProps {
  outline: StoryOutlineScene[];
  expanded: boolean;
  onToggle: () => void;
}

function OutlinePreview({ outline, expanded, onToggle }: OutlinePreviewProps) {
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <span>Story Outline ({outline.length} scenes)</span>
        {expanded ? (
          <FontAwesomeIcon icon={faChevronUp} className="h-4 w-4" />
        ) : (
          <FontAwesomeIcon icon={faChevronDown} className="h-4 w-4" />
        )}
      </button>
      {expanded && (
        <div className="max-h-[400px] overflow-auto border-t">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Location</th>
                <th className="px-2 py-1.5 font-medium">Elements</th>
                <th className="px-2 py-1.5 font-medium">Characters</th>
                <th className="px-2 py-1.5 font-medium">Activity</th>
                <th className="px-2 py-1.5 font-medium">Mood</th>
                <th className="px-2 py-1.5 font-medium">Composition</th>
              </tr>
            </thead>
            <tbody>
              {outline.map((scene) => (
                <tr key={scene.sceneNumber} className="border-t hover:bg-muted/30">
                  <td className="px-2 py-1.5 text-muted-foreground">{scene.sceneNumber}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{scene.locationName}</span>
                    <br />
                    <span className="text-muted-foreground">{scene.locationModifier}</span>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {scene.sceneElements.join(", ")}
                  </td>
                  <td className="px-2 py-1.5">{scene.characterNames.join(", ")}</td>
                  <td className="px-2 py-1.5">{scene.activity}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{scene.mood}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{scene.composition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
