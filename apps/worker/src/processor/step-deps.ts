import crypto from "node:crypto";
import {
  getR2Config,
  createR2Client,
  uploadToR2 as r2Upload,
  resolveR2Url,
} from "@vx/server-core/r2";
import { renderPdfToImages } from "@vx/server-core/pdf-renderer";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";
import {
  CLONE_EXTRACTION_PROMPT,
  buildReproductionPrompt,
  buildRedesignPrompt,
} from "@vx/server-core/ai/prompts";
import {
  generateCharacterReference,
  generateLocationReference,
  editImage,
} from "@vx/server-core/ai";

const r2Config = getR2Config();
const r2Client = createR2Client(r2Config);

async function uploadToR2(args: { key: string; body: Buffer; contentType: string }) {
  return r2Upload({ client: r2Client, config: r2Config, ...args });
}

async function readPdfFromR2(key: string): Promise<Buffer> {
  const url = resolveR2Url(`/${key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchPdf(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function analyzePage(imageUrl: string, jobId: string): Promise<unknown> {
  const extracted = await visionAnalyzeJSON<{
    scene?: unknown;
    environment?: unknown;
    characters?: unknown[];
    locations?: unknown[];
    props?: unknown[];
  }>(imageUrl, CLONE_EXTRACTION_PROMPT, {
    maxTokens: 4000,
    temperature: 0.3,
    trace: { caller: "worker/analyze", entityType: "cloneJob", entityId: jobId },
  });
  const reproductionPrompt = buildReproductionPrompt(extracted);
  return {
    scene: extracted.scene ?? { description: "", cameraView: "wide", composition: "" },
    environment: extracted.environment ?? {
      timeOfDay: "day",
      weather: "sunny",
      season: "neutral",
      mood: "peaceful",
    },
    characters: extracted.characters ?? [],
    locations: extracted.locations ?? [],
    props: extracted.props ?? [],
    reproductionPrompt,
  };
}

async function generatePage(args: {
  prompt: string;                // kept for signature compat; ignored
  sourceImageUrl: string;
  pageNumber: number;
  jobId: string;
  changePercent?: number;        // optional; defaults to 30 to match manual reproduce
}): Promise<{ base64: string }> {
  const fullPrompt = buildRedesignPrompt(args.changePercent ?? 30);
  const img = await editImage(resolveR2Url(args.sourceImageUrl), fullPrompt, {
    trace: { caller: "worker/reproduce", entityType: "cloneJob", entityId: args.jobId },
  });
  return { base64: img.base64 || img.dataUrl?.split(",")[1] || "" };
}

export const downloadDeps = { fetchPdf, uploadToR2 };
export const renderDeps = { readPdfFromR2, renderPdfToImages, uploadToR2 };
export const analyzeDeps = { analyzePage, resolveR2Url };
export const extractEntitiesDeps = {
  generateCharacterReference: (prompt: string, opts: { sourceImageUrl?: string; characterName: string; characterInfo?: string }) =>
    generateCharacterReference(prompt, {
      sourceImageUrl: opts.sourceImageUrl,
      characterName: opts.characterName,
      characterInfo: opts.characterInfo,
      trace: { caller: "worker/extract-entities", entityType: "character" },
    }),
  generateLocationReference: (prompt: string, opts: { sourceImageUrl?: string; locationName: string }) =>
    generateLocationReference(prompt, {
      sourceImageUrl: opts.sourceImageUrl,
      locationName: opts.locationName,
      trace: { caller: "worker/extract-entities", entityType: "location" },
    }),
  uploadToR2,
  randomUUID: () => crypto.randomUUID(),
};
export const reproduceDeps = { generatePage, uploadToR2, resolveR2Url };
export const createBookDeps = { randomUUID: () => crypto.randomUUID() };
