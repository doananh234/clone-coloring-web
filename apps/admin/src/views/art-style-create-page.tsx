"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Textarea, Card, CardContent } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faFloppyDisk,
  faSpinner,
  faSparkles,
  faWandMagicSparkles,
} from "@fortawesome/pro-regular-svg-icons";
import { EMPTY_ART_STYLE } from "@/lib/ai/art-style-types";
import type { ArtStyleEntity } from "@/lib/ai/art-style-types";
import { buildDirectiveFromProperties } from "@/lib/ai/prompts";
import { PropertyGroupSections, ReferenceImageSection } from "./art-style-form-sections";

type FormData = Omit<ArtStyleEntity, "id" | "createdAt" | "updatedAt">;

export function ArtStyleCreatePage({ artStyleId }: { artStyleId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExtractMode = searchParams?.get("mode") === "extract";
  const isEdit = Boolean(artStyleId);

  const [formData, setFormData] = useState<FormData>({ ...EMPTY_ART_STYLE });
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"manual" | "extract">(isExtractMode ? "extract" : "manual");

  // Load existing data for edit mode
  useEffect(() => {
    if (!artStyleId) return;
    fetch(`/api/art-styles/${artStyleId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          const { id, createdAt, updatedAt, ...rest } = data;
          setFormData(rest as FormData);
          if (data.referenceImages?.length) {
            setImageFiles(data.referenceImages.map((img: { url: string }) => img.url));
          }
        }
      })
      .catch(() => notify.error("Failed to load art style"));
  }, [artStyleId]);

  function updateGroup(group: string, field: string, value: unknown) {
    setFormData((prev) => ({
      ...prev,
      [group]: {
        ...((prev as Record<string, unknown>)[group] as Record<string, unknown>),
        [field]: value,
      },
    }));
  }

  const handleAddImages = useCallback(
    (files: FileList) => {
      const remaining = 3 - imageFiles.length;
      const toProcess = Array.from(files).slice(0, remaining);
      toProcess.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setImageFiles((prev) => (prev.length < 3 ? [...prev, result] : prev));
        };
        reader.readAsDataURL(file);
      });
    },
    [imageFiles.length],
  );

  function handleRemoveImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAnalyze() {
    if (imageFiles.length === 0) {
      notify.error("Upload at least one image");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/art-styles/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: imageFiles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      // Merge extracted data into formData
      setFormData((prev) => ({
        ...prev,
        ...(data.name && { name: data.name }),
        ...(data.description && { description: data.description }),
        ...(data.lineWork && { lineWork: { ...prev.lineWork, ...data.lineWork } }),
        ...(data.composition && { composition: { ...prev.composition, ...data.composition } }),
        ...(data.formAndShape && { formAndShape: { ...prev.formAndShape, ...data.formAndShape } }),
        ...(data.moodAndAtmosphere && {
          moodAndAtmosphere: { ...prev.moodAndAtmosphere, ...data.moodAndAtmosphere },
        }),
        ...(data.patternAndTexture && {
          patternAndTexture: { ...prev.patternAndTexture, ...data.patternAndTexture },
        }),
        ...(data.technical && { technical: { ...prev.technical, ...data.technical } }),
        ...(data.generationDirective && { generationDirective: data.generationDirective }),
        ...(data.tags && { tags: data.tags }),
      }));
      notify.success("Style extracted — review and edit below");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      notify.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        referenceImageUrls: imageFiles,
        tags:
          typeof formData.tags === "string"
            ? (formData.tags as unknown as string)
                .split(",")
                .map((t: string) => t.trim())
                .filter(Boolean)
            : formData.tags,
      };
      const url = isEdit ? `/api/art-styles/${artStyleId}` : "/api/art-styles";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      notify.success(isEdit ? "Art style updated" : "Art style created");
      router.push(isEdit ? `/art-styles/${artStyleId}` : `/art-styles/${data.id}`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleAutoDirective() {
    const directive = buildDirectiveFromProperties(formData);
    setFormData((prev) => ({ ...prev, generationDirective: directive }));
    notify.success("Directive generated from properties");
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{isEdit ? "Edit Art Style" : "Create Art Style"}</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <FontAwesomeIcon
            icon={saving ? faSpinner : faFloppyDisk}
            spin={saving}
            className="mr-1.5 h-3.5 w-3.5"
          />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Mode toggle (create only) */}
      {!isEdit && (
        <div className="mb-4 flex gap-2">
          <Button
            variant={mode === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("manual")}
          >
            Manual
          </Button>
          <Button
            variant={mode === "extract" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("extract")}
          >
            <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-1.5 h-3.5 w-3.5" />
            Extract from Image
          </Button>
        </div>
      )}

      {/* Extract mode: analyze section */}
      {mode === "extract" && !isEdit && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">AI Style Extraction</h3>
            <p className="text-xs text-muted-foreground">
              Upload reference images and let AI analyze the art style properties.
            </p>
            <ReferenceImageSection
              imageFiles={imageFiles}
              onAdd={handleAddImages}
              onRemove={handleRemoveImage}
            />
            <Button onClick={handleAnalyze} disabled={analyzing || imageFiles.length === 0}>
              <FontAwesomeIcon
                icon={analyzing ? faSpinner : faSparkles}
                spin={analyzing}
                className="mr-1.5 h-3.5 w-3.5"
              />
              {analyzing ? "Analyzing..." : "Analyze Style"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Form sections */}
      <div className="space-y-4">
        {/* Basic Info */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Basic Information</h3>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Art style name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this art style"
              />
            </div>
          </CardContent>
        </Card>

        {/* Reference images (manual mode or edit) */}
        {(mode === "manual" || isEdit) && (
          <ReferenceImageSection
            imageFiles={imageFiles}
            onAdd={handleAddImages}
            onRemove={handleRemoveImage}
          />
        )}

        {/* Property groups */}
        <PropertyGroupSections formData={formData} updateGroup={updateGroup} />

        {/* Generation Directive */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Generation Directive</h3>
              <Button variant="outline" size="sm" onClick={handleAutoDirective}>
                <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
                Auto-generate
              </Button>
            </div>
            <Textarea
              rows={4}
              value={formData.generationDirective}
              onChange={(e) => setFormData((p) => ({ ...p, generationDirective: e.target.value }))}
              placeholder="Directive used when generating coloring pages with this style..."
            />
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Tags</h3>
            <Input
              value={
                Array.isArray(formData.tags)
                  ? formData.tags.join(", ")
                  : ((formData.tags as unknown as string) ?? "")
              }
              onChange={(e) =>
                setFormData((p) => ({ ...p, tags: e.target.value as unknown as string[] }))
              }
              placeholder="Comma-separated tags (e.g. mandala, kids, zen)"
            />
          </CardContent>
        </Card>

        {/* Bottom actions */}
        <div className="flex justify-end gap-3 pb-8">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <FontAwesomeIcon
              icon={saving ? faSpinner : faFloppyDisk}
              spin={saving}
              className="mr-1.5 h-3.5 w-3.5"
            />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
