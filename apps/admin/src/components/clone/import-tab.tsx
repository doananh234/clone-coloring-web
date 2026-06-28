"use client";

import { useState } from "react";
import { Button } from "@vx/core-uikit/components";
import { toast } from "sonner";

interface DryRunResult {
  imported: number;
  skipped: number;
  invalid: number;
  invalidRows: Array<{ line: number; reason: string }>;
}

export function ImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runDryRun(selected: File) {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", selected);
      const res = await fetch("/api/clone/import-csv?dryRun=1", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setDry(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/clone/import-csv", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      toast.success(
        `Queued ${json.imported} clone jobs (${json.skipped} duplicates, ${json.invalid} invalid)`,
      );
      setFile(null);
      setDry(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-6">
        <h2 className="mb-2 text-lg font-semibold">Import source books from CSV</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Expected header:{" "}
          <code className="text-xs">
            _id, fileName, fileSize, topicName (Brand), thumbnailUrl, thumbnailPreview, book url, Select, Remove, Niche, Priority
          </code>
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setDry(null);
            if (f) runDryRun(f);
          }}
        />
      </div>

      {dry && (
        <div className="rounded-lg border p-6 space-y-3">
          <div className="flex gap-6 text-sm">
            <span>New: <strong>{dry.imported}</strong></span>
            <span>Duplicates: <strong>{dry.skipped}</strong></span>
            <span>Invalid: <strong>{dry.invalid}</strong></span>
          </div>
          {dry.invalidRows.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">Invalid rows ({dry.invalidRows.length})</summary>
              <ul className="mt-2 list-disc pl-5">
                {dry.invalidRows.map((r) => (
                  <li key={r.line}>
                    line {r.line}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button disabled={loading || dry.imported === 0} onClick={commit}>
            Import {dry.imported} jobs
          </Button>
        </div>
      )}
    </div>
  );
}
