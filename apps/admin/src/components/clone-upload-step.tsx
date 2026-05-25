"use client";

import { useState, useRef, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCloudArrowUp, faFilePdf, faSpinner } from "@fortawesome/pro-regular-svg-icons";
import type { CloneJob } from "@/lib/ai/clone-types";

interface CloneUploadStepProps {
  onUploaded: (job: CloneJob) => void;
}

export function CloneUploadStep({ onUploaded }: CloneUploadStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (f: File) => {
      if (!f.name.toLowerCase().endsWith(".pdf")) {
        setError("Please select a PDF file");
        return;
      }
      setFile(f);
      setError(null);
      if (!name) {
        setName(f.name.replace(/\.pdf$/i, ""));
      }
    },
    [name],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (name) formData.append("name", name);

      const res = await fetch("/api/clone", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Upload failed");

      onUploaded(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        } ${file ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {file ? (
          <>
            <FontAwesomeIcon icon={faFilePdf} className="mb-3 h-10 w-10 text-green-600" />
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} MB — Click to change
            </p>
          </>
        ) : (
          <>
            <FontAwesomeIcon
              icon={faCloudArrowUp}
              className="mb-3 h-10 w-10 text-muted-foreground"
            />
            <p className="text-sm font-medium">Drop a PDF here or click to browse</p>
            <p className="text-xs text-muted-foreground">Max 50MB</p>
          </>
        )}
      </div>

      {/* Name input */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Job Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Optional — defaults to filename"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {uploading && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
        {uploading ? "Extracting pages..." : "Upload & Extract"}
      </button>
    </div>
  );
}
