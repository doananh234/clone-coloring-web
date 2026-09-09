/**
 * The prompt for redrawing one existing coloring page (single-page Regen /
 * Đổi góc).
 *
 * Two callers build this: the worker's regen GenerationJob and the clone
 * reproduce helper. They each had their own copy, which is fine until the UI
 * shows the prompt for editing — the intro regen dialog prefills its box from
 * GET /api/page-regen-prompt, and a box showing something other than what the
 * server sends is worse than no box. One builder, one string.
 *
 * Pure: the caller decides the frame instruction (frameInstruction() reads env)
 * and passes it in.
 */
export interface PageRegenPromptOptions {
  /** Forced new camera view ("đổi góc"). Omit to keep the page's own angle. */
  cameraView?: string;
  /**
   * How many B&W style-reference images follow the source page. 0 or omitted
   * means no references: the page's OWN line-art style is preserved instead of
   * being restyled.
   */
  styleRefCount?: number;
  /** Directive from the chosen B&W art style. Only used with style references. */
  styleDirective?: string;
  /** Extra user-typed changes. Appended last so they take priority. */
  instructions?: string;
  /** KDP frame instruction, from frameInstruction(). Empty/omitted appends none. */
  frame?: string;
}

const LINE_ART = "Clean black-and-white line art only (no color, no shading).";

const PRESERVE_STYLE =
  "CRITICAL — PRESERVE THE ORIGINAL LINE-ART STYLE: keep the EXACT same stroke weight, line thickness, curve treatment and drawing technique as the source image. Do NOT restyle, do NOT redesign, do NOT change the artistic style.";

export function buildPageRegenPrompt(options: PageRegenPromptOptions = {}): string {
  const { cameraView, styleRefCount = 0, styleDirective, instructions, frame } = options;

  let prompt = styleRefCount > 0
    ? buildStyledPrompt(cameraView, styleRefCount, styleDirective)
    : buildPreserveStylePrompt(cameraView);

  if (frame) prompt += `\n\n${frame}`;

  const extra = instructions?.trim();
  if (extra) {
    prompt += `\n\nUSER-REQUESTED CHANGES (apply these exactly to the redrawn page, they take priority): ${extra}`;
  }
  return prompt;
}

/** No style reference chosen → clone the page's own nét vẽ, don't redesign it. */
function buildPreserveStylePrompt(cameraView?: string): string {
  const task = cameraView
    ? `Redraw this black-and-white coloring page from a ${cameraView} CAMERA VIEW — the composition, framing and viewpoint MUST change SIGNIFICANTLY to fit this new angle (do NOT keep the original camera position). Keep the SAME characters, objects and scene, only the viewpoint changes`
    : `Redraw this black-and-white coloring page keeping the SAME scene, composition, characters, objects and camera angle`;
  return `${task}. ${PRESERVE_STYLE} ${LINE_ART} Output must be 1 single frame, not a split panel or grid layout.`;
}

/**
 * A B&W art style was chosen → its reference images follow the source page and
 * lend their STYLE only. The ordering block matters: the model is told exactly
 * which image is the scene and which are style samples.
 */
function buildStyledPrompt(cameraView: string | undefined, styleRefCount: number, styleDirective?: string): string {
  const total = 1 + styleRefCount;
  const styleLabel = styleRefCount > 1 ? `IMAGE 2-${total}` : "IMAGE 2";
  const task = cameraView
    ? `Redraw IMAGE 1 from a ${cameraView} CAMERA VIEW — the composition, framing and viewpoint MUST change SIGNIFICANTLY to fit this new angle (do NOT keep the original camera position). Keep the same characters, objects and scene, only the viewpoint changes`
    : `Redraw IMAGE 1 keeping the SAME scene, composition and camera angle`;

  return (
    `You are given ${total} images IN THIS EXACT ORDER:\n` +
    `- IMAGE 1 = SOURCE PAGE: the coloring page to redraw. Keep its scene, characters and objects.\n` +
    `- ${styleLabel} = STYLE REFERENCE(S): black-and-white line-art sample(s). Copy ONLY their drawing STYLE (stroke weight, curve treatment, spacing, motif treatment). Do NOT copy their subject, scene or content.\n\n` +
    `TASK: ${task}, in the black-and-white line-art style of ${styleLabel}. ${LINE_ART} ` +
    `STRICT: Do NOT redraw, reproduce or borrow the CONTENT of ${styleLabel} — take its STYLE only.` +
    (styleDirective ? `\n\nStyle directive (applies to the STYLE of ${styleLabel} only):\n${styleDirective}` : "")
  );
}
