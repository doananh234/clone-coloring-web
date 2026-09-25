/**
 * Colorize job → colorizeImage wiring.
 *
 * The operator's backend choice (provider + LiteLLM model) is carried on the
 * GenerationJob payload; these cover that it reaches the image provider, since
 * a dropped `model` fails silently — the job still succeeds, just on whatever
 * LITELLM_IMAGE_MODEL happens to be.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ai = vi.hoisted(() => ({
  colorizeImage: vi.fn(async () => ({ base64: "AAA", dataUrl: "data:image/png;base64,AAA" })),
}));

const db = vi.hoisted(() => ({
  generationJobFindUnique: vi.fn(),
  generationJobUpdate: vi.fn(async () => ({})),
  coloringStyleFindUnique: vi.fn(async () => ({
    id: "st1",
    colorizationDirective: "warm pastel",
    referenceImages: [],
    variants: [],
  })),
  bookFindUnique: vi.fn(async () => null),
  bookUpdate: vi.fn(async () => ({})),
}));

vi.mock("@vx/server-core/ai", () => ({
  colorizeImage: ai.colorizeImage,
  generateCoverSourceBW: vi.fn(),
  generateCoverSource: vi.fn(),
  editImage: vi.fn(),
  videoFromImage: vi.fn(),
  downloadVideo: vi.fn(),
  usesCompactPrompts: vi.fn(() => false),
}));

vi.mock("@vx/db", () => ({
  prisma: {
    generationJob: {
      findUnique: (...a: unknown[]) => db.generationJobFindUnique(...a),
      update: (...a: unknown[]) => db.generationJobUpdate(...a),
    },
    coloringStyle: { findUnique: (...a: unknown[]) => db.coloringStyleFindUnique(...a) },
    book: {
      findUnique: (...a: unknown[]) => db.bookFindUnique(...a),
      update: (...a: unknown[]) => db.bookUpdate(...a),
    },
  },
}));

vi.mock("@vx/server-core/r2", () => ({
  getR2Config: () => ({}),
  createR2Client: () => ({}),
  uploadToR2: vi.fn(async () => ({ url: "https://r2/colored.png" })),
  resolveR2Url: (k: string) => `https://r2/${String(k).replace(/^\//, "")}`,
}));

vi.mock("@napi-rs/canvas", () => ({ createCanvas: vi.fn(), loadImage: vi.fn() }));
vi.mock("@vx/server-core/cover-generation", () => ({
  generateAiCover: vi.fn(),
  buildCoverTypographyPrompt: vi.fn(),
  buildCoverTypographyPromptCompact: vi.fn(),
}));
vi.mock("@vx/server-core/ai/prompts", () => ({
  frameInstruction: vi.fn(),
  pickDifferentCameraView: vi.fn(),
  buildPageRegenPrompt: vi.fn(),
}));
vi.mock("@vx/server-core/book-export", () => ({
  collectExportPlan: vi.fn(),
  buildExportZip: vi.fn(),
  stableExportUrl: vi.fn(),
}));

import { processGenerationJob } from "./generation-job-processor";

/** Queue one colorize job with the given payload and run it to completion. */
async function runColorizeJob(payload: Record<string, unknown>) {
  db.generationJobFindUnique.mockResolvedValue({
    id: "job1",
    type: "colorize",
    bookId: "b1",
    payload: { imageUrl: "/p1.png", coloringStyleId: "st1", ...payload },
  });
  await processGenerationJob("job1");
}

/** Options handed to colorizeImage on the most recent call. */
function colorizeOptions(): Record<string, unknown> {
  expect(ai.colorizeImage).toHaveBeenCalled();
  return ai.colorizeImage.mock.calls.at(-1)![2] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.coloringStyleFindUnique.mockResolvedValue({
    id: "st1",
    colorizationDirective: "warm pastel",
    referenceImages: [],
    variants: [],
  });
  db.bookFindUnique.mockResolvedValue(null);
  ai.colorizeImage.mockResolvedValue({ base64: "AAA", dataUrl: "data:image/png;base64,AAA" });
});

describe("colorize job → colorizeImage", () => {
  it("forwards the operator's provider and LiteLLM model", async () => {
    await runColorizeJob({ provider: "litellm", model: "qwen-image-2.1" });

    expect(colorizeOptions()).toMatchObject({
      provider: "litellm",
      model: "qwen-image-2.1",
    });
  });

  it("omits model entirely when none was chosen, so the server default applies", async () => {
    await runColorizeJob({ provider: "litellm" });

    // Not "model: undefined" — an explicit undefined would still override a
    // caller-supplied default further down the provider chain.
    expect(colorizeOptions()).not.toHaveProperty("model");
  });

  it("omits model when the payload carries an empty string", async () => {
    await runColorizeJob({ provider: "litellm", model: "" });

    expect(colorizeOptions()).not.toHaveProperty("model");
  });

  it("still passes the model when no provider was chosen", async () => {
    // provider undefined = fall back to IMAGE_PROVIDER; the model must survive
    // that path too, otherwise picking a model without touching the provider
    // dropdown would silently do nothing.
    await runColorizeJob({ model: "gpt-image-2" });

    expect(colorizeOptions()).toMatchObject({ model: "gpt-image-2" });
  });
});
