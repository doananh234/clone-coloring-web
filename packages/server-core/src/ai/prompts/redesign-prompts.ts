/**
 * Redesign Prompts — image-to-image redesign template for clone flow.
 *
 * All camera-view knowledge (allowed views, synonyms, prompt wording) lives
 * here so routes/UI never hardcode prompt text.
 */

export const CAMERA_VIEWS = ["close-up", "medium", "wide", "bird's-eye", "low-angle"] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];

/** Short parenthetical shown to the image model so each view is unambiguous. */
const CAMERA_VIEW_HINTS: Record<CameraView, string> = {
  "close-up": "framed tightly on the main character or subject",
  medium: "subject at a normal eye-level distance, some surroundings visible",
  wide: "full scene visible with plenty of surroundings",
  "bird's-eye": "looking down on the scene from above",
  "low-angle": "looking up at the subject from a low position",
};

/** Maps analyze-step cameraView values (free-form) onto our canonical list. */
const CAMERA_VIEW_SYNONYMS: Record<string, CameraView> = {
  "close-up": "close-up",
  closeup: "close-up",
  "close up": "close-up",
  medium: "medium",
  "medium shot": "medium",
  "eye-level": "medium",
  "eye level": "medium",
  wide: "wide",
  "wide shot": "wide",
  "full shot": "wide",
  "bird's-eye": "bird's-eye",
  "birds-eye": "bird's-eye",
  "bird's eye": "bird's-eye",
  "top-down": "bird's-eye",
  "top down": "bird's-eye",
  aerial: "bird's-eye",
  overhead: "bird's-eye",
  "low-angle": "low-angle",
  "low angle": "low-angle",
  "worm's-eye": "low-angle",
  "worm's eye": "low-angle",
};

/**
 * Picks a random camera view guaranteed different from the given view(s)
 * (after synonym normalization). Unknown/empty entries are ignored; if the
 * exclusions would empty the list, the full list is used. `random` is
 * injectable for tests.
 */
export function pickDifferentCameraView(
  exclude: string | undefined | Array<string | undefined>,
  random: () => number = Math.random,
): CameraView {
  const excludeList = (Array.isArray(exclude) ? exclude : [exclude])
    .map((v) => CAMERA_VIEW_SYNONYMS[(v ?? "").toLowerCase().trim()])
    .filter((v): v is CameraView => !!v);
  const filtered = CAMERA_VIEWS.filter((v) => !excludeList.includes(v));
  const candidates = filtered.length > 0 ? filtered : [...CAMERA_VIEWS];
  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  return candidates[index];
}

export interface RedesignPromptOptions {
  /** Force the redraw to use this camera view (composition may fully change). */
  cameraView?: CameraView;
}

export function buildRedesignPrompt(
  changePercent: number,
  opts: RedesignPromptOptions = {},
): string {
  const pct = changePercent || 30;
  const { cameraView } = opts;

  const cameraBlock = cameraView
    ? `

REQUIRED CAMERA CHANGE:
- Redraw this exact scene from a ${cameraView} camera view
  (${CAMERA_VIEW_HINTS[cameraView]})
- The composition and framing MUST change to fit the new angle
- Keep the same scene, characters, and props — only the viewpoint changes`
    : "";

  // With a forced camera view the viewing angle is required, not optional.
  const poseLine = cameraView
    ? "- Character pose and posture"
    : "- Character pose, posture, and viewing angle";

  return `This is a black-and-white coloring book page for young children. Generate
a refreshed variation (~${pct}% change) of this image.${cameraBlock}. Output must be 1 single frame, not a split panel or grid layout.

KEEP unchanged:
- Line-art style and line weight (identical drawing technique)
- Character identity: same species, same face, same art style
- Overall scene type / setting context
- Children's coloring book aesthetic: bold clean outlines, large EMPTY
  white interiors inside every shape, minimal interior detail

MAY CHANGE freely:
${poseLine}
- Character outfit, hairstyle, and worn accessories (jewelry, hats, scarves)
- Position of props within the scene (rearrange layout)
- Individual props can be swapped for similar items
  (e.g. teapot → kettle, tulip → daisy, book → notepad)

DO NOT:
- Add any color, shading, or gradients
- Add interior texture, stippling, dots, crosshatching, hatching lines,
  or decorative pattern fills inside any shape. Object interiors must
  stay mostly EMPTY so children can color them in.
  Examples of what NOT to do:
  · No seed dots on strawberries or fruits
  · No crumb marks, holes, or texture spots on bread/pastries
  · No scale lines on fish, no fur lines on animals
  · No wood-grain marks on wooden furniture
  · No fabric weave patterns on clothing
- Subdivide large shapes with extra decorative lines
- Change the line thickness or drawing technique
- Replace the character with a different species
- Break the coloring-book outline aesthetic`;
}
