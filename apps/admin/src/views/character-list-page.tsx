"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Badge, Input, Card, CardContent } from "@vx/core-uikit/components";
import { ConfirmDialog } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faEye,
  faTrash,
  faUser,
  faUpload,
  faRotate,
  faImageSlash,
} from "@fortawesome/pro-regular-svg-icons";
import { appNavigate } from "@/lib/navigate";
import { ExtractionReviewModal } from "@/components/extraction-review-modal";

// --- Types ---

interface CharacterEntity {
  id: string;
  name: string;
  type: string;
  role: string;
  visualDna: Record<string, unknown>;
  characterPrompt: string;
  referenceImageUrl?: string;
  sourceImageUrl?: string;
  tags: string[];
  category?: string;
  sourceBookId?: string;
  sourcePageId?: string;
}

// --- Filter types ---

type FilterKey = "all" | "animal" | "character" | "person" | "object" | "missing_image";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "missing_image", label: "Missing Image" },
  { key: "animal", label: "Animal" },
  { key: "character", label: "Character" },
  { key: "person", label: "Person" },
  { key: "object", label: "Object" },
];

function applyFilter(items: CharacterEntity[], filter: FilterKey): CharacterEntity[] {
  if (filter === "all") return items;
  if (filter === "missing_image") return items.filter((c) => !c.referenceImageUrl);
  return items.filter((c) => c.type === filter);
}

// --- Helpers ---

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

const ROLE_COLORS: Record<string, string> = {
  main_character: "bg-blue-100 text-blue-700",
  supporting: "bg-purple-100 text-purple-700",
  background: "bg-gray-100 text-gray-600",
};

const TYPE_COLORS: Record<string, string> = {
  animal: "bg-green-100 text-green-700",
  character: "bg-indigo-100 text-indigo-700",
  person: "bg-orange-100 text-orange-700",
  object: "bg-yellow-100 text-yellow-700",
};

// --- Component ---

export function CharacterListPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [deleteTarget, setDeleteTarget] = useState<CharacterEntity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [extractionOpen, setExtractionOpen] = useState(false);
  const [extractionImageUrl, setExtractionImageUrl] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  function handleUploadForExtraction(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setExtractionImageUrl(reader.result as string);
      setExtractionOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const { data: result, isLoading } = useQuery({
    queryKey: ["characters"],
    queryFn: () => fetch("/api/characters").then((r) => r.json()),
  });

  const allCharacters: CharacterEntity[] = result?.data ?? [];

  const filtered = useMemo(() => {
    let items = applyFilter(allCharacters, filter);
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.name?.toLowerCase().includes(lower) ||
          c.tags?.some((t) => t.toLowerCase().includes(lower)),
      );
    }
    return items;
  }, [allCharacters, filter, search]);

  const missingCount = useMemo(
    () => allCharacters.filter((c) => !c.referenceImageUrl).length,
    [allCharacters],
  );

  async function handleRegenerateMissing() {
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/extract/regenerate-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "characters" }),
      });
      const data = await res.json();
      if (data.success) {
        notify.success(`Regenerated ${data.succeeded} of ${data.total} characters`);
        if (data.failed > 0) {
          notify.error(`${data.failed} failed to regenerate`);
        }
        queryClient.invalidateQueries({ queryKey: ["characters"] });
      } else {
        notify.error(data.error || "Failed to regenerate");
      }
    } catch {
      notify.error("Failed to regenerate missing images");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/characters/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        notify.success("Character deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["characters"] });
      } else {
        notify.error(data.error || "Failed to delete");
      }
    } catch {
      notify.error("Failed to delete character");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Characters</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {allCharacters.length} characters
          </p>
        </div>
        <div className="flex gap-2">
          {missingCount > 0 && (
            <Button
              variant="outline"
              onClick={handleRegenerateMissing}
              disabled={isRegenerating}
            >
              <FontAwesomeIcon
                icon={faRotate}
                className={`mr-2 h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`}
              />
              {isRegenerating
                ? "Regenerating..."
                : `Regenerate Missing (${missingCount})`}
            </Button>
          )}
          <input
            type="file"
            accept="image/*"
            id="character-upload"
            className="hidden"
            onChange={handleUploadForExtraction}
          />
          <Button onClick={() => document.getElementById("character-upload")?.click()}>
            <FontAwesomeIcon icon={faUpload} className="mr-2 h-4 w-4" />
            Extract from Image
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search by name or tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No characters found</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onView={() => appNavigate(`/characters/${character.id}`)}
              onDelete={() => setDeleteTarget(character)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Character"
        description={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ExtractionReviewModal
        open={extractionOpen}
        onOpenChange={(open) => {
          setExtractionOpen(open);
          if (!open) queryClient.invalidateQueries({ queryKey: ["characters"] });
        }}
        imageUrl={extractionImageUrl}
        sourceBookId=""
        sourcePageId=""
      />
    </div>
  );
}

// --- CharacterCard sub-component ---

function CharacterCard({
  character,
  onView,
  onDelete,
}: {
  character: CharacterEntity;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={onView}
    >
      {/* Reference image */}
      <div className="relative aspect-square bg-muted">
        {character.referenceImageUrl ? (
          <img
            src={resolveUrl(character.referenceImageUrl)}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <FontAwesomeIcon icon={faUser} className="h-12 w-12 opacity-30" />
          </div>
        )}
        {/* Type + role badges overlay */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[character.type] || "bg-gray-100 text-gray-600"}`}
          >
            {character.type}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[character.role] || "bg-gray-100 text-gray-600"}`}
          >
            {character.role?.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Card content */}
      <CardContent className="p-3">
        <p className="truncate text-sm font-semibold">{character.name}</p>
        {/* Tags */}
        {character.tags?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {character.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
            {character.tags.length > 4 && (
              <Badge variant="outline" className="text-[10px]">
                +{character.tags.length - 4}
              </Badge>
            )}
          </div>
        )}
        {/* Actions */}
        <div className="mt-2 flex justify-end">
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
            >
              <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
