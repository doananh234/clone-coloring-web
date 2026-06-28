import Papa from "papaparse";
import type { SourceBook } from "@vx/clone-core";

interface RawRow {
  _id?: string;
  fileName?: string;
  fileSize?: string;
  "topicName (Brand)"?: string;
  thumbnailUrl?: string;
  thumbnailPreview?: string;
  "book url"?: string;
  Select?: string;
  Remove?: string;
  Niche?: string;
  Priority?: string;
}

export interface ParseResult {
  rows: SourceBook[];
  invalid: Array<{ line: number; reason: string }>;
}

export function parseSourceBooksCsv(csvText: string, importedFromCsv: string): ParseResult {
  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: SourceBook[] = [];
  const invalid: ParseResult["invalid"] = [];
  const now = new Date().toISOString();

  parsed.data.forEach((row, i) => {
    const line = i + 2;
    if (!row._id?.trim()) {
      invalid.push({ line, reason: "missing _id" });
      return;
    }
    if (!row["book url"]?.trim()) {
      invalid.push({ line, reason: "missing book url" });
      return;
    }
    rows.push({
      id: row._id.trim(),
      fileName: (row.fileName ?? "").trim(),
      fileSize: Number(row.fileSize ?? 0) || 0,
      brand: (row["topicName (Brand)"] ?? "").trim(),
      thumbnailUrl: (row.thumbnailUrl ?? "").trim(),
      sourcePdfUrl: row["book url"].trim(),
      niche: row.Niche?.trim() || undefined,
      priority: row.Priority?.trim() || undefined,
      selectedInCsv: (row.Select ?? "").trim().toUpperCase() === "TRUE",
      importedFromCsv,
      createdAt: now,
    });
  });

  return { rows, invalid };
}
