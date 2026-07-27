/**
 * Normalizes a book coloringPage's `sceneData` + `prompt` for display.
 *
 * `sceneData` comes from the source clone job's analyze step, copied at
 * create-book time. It can arrive as a proper object, a JSON string, or (on some
 * legacy books) malformed — a JSON string spread into numeric keys "0".."N"; the
 * real keys usually sit alongside, and we reconstruct + reparse as a fallback.
 *
 * Real data is often sparse in the top-level `scene.description` / `prompt` /
 * `reproductionPrompt` (frequently empty), while the useful detail lives in
 * `characters[].characterPrompt`, `locations[].locationPrompt`, `environment`,
 * etc. So we surface all of it and derive a best-effort prompt.
 */

export interface ParsedChar {
  name: string;
  prompt?: string;
  role?: string;
  type?: string;
}
export interface ParsedLoc {
  name: string;
  prompt?: string;
  description?: string;
}
export interface ParsedEnv {
  mood?: string;
  season?: string;
  weather?: string;
  timeOfDay?: string;
}
export interface ParsedScene {
  sceneDesc?: string;
  cameraView?: string;
  composition?: string;
  environment?: ParsedEnv;
  characters: ParsedChar[];
  locations: ParsedLoc[];
  /** Explicit reproduction/redesign prompt (often empty). */
  reproductionPrompt?: string;
  /** Best available prompt text: reproductionPrompt → joined character prompts. */
  promptText?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

/** Rebuild the original JSON string from a numeric-key ("0","1",…) spread object. */
function reconstructFromNumeric(obj: Record<string, unknown>): string | null {
  const idx = Object.keys(obj)
    .filter((k) => /^\d+$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);
  if (idx.length === 0) return null;
  let out = "";
  for (const i of idx) {
    const ch = obj[String(i)];
    if (typeof ch !== "string") return null;
    out += ch;
  }
  return out;
}

function toChars(v: unknown): ParsedChar[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      name: str(e.name) ?? "",
      prompt: str(e.characterPrompt),
      role: str(e.role),
      type: str(e.type),
    }))
    .filter((c) => c.name.length > 0);
}

function toLocs(v: unknown): ParsedLoc[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      name: str(e.name) ?? "",
      prompt: str(e.locationPrompt),
      description: str(e.description) ?? str(e.visualDescription),
    }))
    .filter((l) => l.name.length > 0);
}

export function parsePageScene(page: { prompt?: string; sceneData?: unknown }): ParsedScene {
  const base: ParsedScene = { characters: [], locations: [] };
  let sd: unknown = page.sceneData;
  if (!sd) return { ...base, promptText: str(page.prompt) };

  if (typeof sd === "string") {
    try {
      sd = JSON.parse(sd);
    } catch {
      return { ...base, promptText: str(page.prompt) };
    }
  }
  if (!sd || typeof sd !== "object") return { ...base, promptText: str(page.prompt) };

  let obj = sd as Record<string, unknown>;
  if (obj.scene === undefined && obj.characters === undefined && obj["0"] !== undefined) {
    const s = reconstructFromNumeric(obj);
    if (s) {
      try {
        obj = JSON.parse(s) as Record<string, unknown>;
      } catch {
        /* keep original */
      }
    }
  }

  const scene = obj.scene;
  const sceneObj = scene && typeof scene === "object" ? (scene as Record<string, unknown>) : undefined;
  const sceneDesc = typeof scene === "string" ? str(scene) : str(sceneObj?.description);
  const cameraView = str(sceneObj?.cameraView);
  const composition = str(sceneObj?.composition);

  const env = obj.environment;
  const envObj = env && typeof env === "object" ? (env as Record<string, unknown>) : undefined;
  const environment: ParsedEnv | undefined = envObj
    ? { mood: str(envObj.mood), season: str(envObj.season), weather: str(envObj.weather), timeOfDay: str(envObj.timeOfDay) }
    : typeof env === "string" && str(env)
      ? { mood: env }
      : undefined;

  const characters = toChars(obj.characters);
  const locations = toLocs(obj.locations);
  const reproductionPrompt = str(obj.reproductionPrompt);

  // Best-effort prompt: explicit reproduction/redesign prompt, else the per-character prompts.
  const charPrompts = characters.map((c) => c.prompt).filter((p): p is string => !!p);
  const promptText = str(page.prompt) ?? reproductionPrompt ?? (charPrompts.length ? charPrompts.join("\n\n") : undefined);

  return { sceneDesc, cameraView, composition, environment, characters, locations, reproductionPrompt, promptText };
}

/** True when there's any analyze detail worth showing. */
export function hasSceneDetail(s: ParsedScene): boolean {
  return Boolean(
    s.sceneDesc ||
      s.cameraView ||
      s.composition ||
      s.promptText ||
      s.characters.length ||
      s.locations.length ||
      (s.environment && (s.environment.mood || s.environment.season || s.environment.weather || s.environment.timeOfDay)),
  );
}
