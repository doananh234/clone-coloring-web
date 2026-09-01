/**
 * KDP-safe frame instructions for B&W coloring pages.
 *
 * Coloring-book INTERIOR pages get a hand-drawn square frame with an even white
 * margin (safe area) so no line touches the outer edge — this keeps the page
 * print-safe on KDP. The frame line is deliberately wobbly / hand-drawn, never a
 * ruler-straight mechanical rectangle.
 *
 * When a page is later COLORIZED or turned into a COVER, the frame is stripped so
 * the artwork goes full-bleed (see REMOVE_FRAME_INSTRUCTION).
 */
export const KDP_FRAME_INSTRUCTION =
  "FRAME (KDP print-safe): Enclose the ENTIRE scene inside ONE hand-drawn SQUARE frame with slightly wobbly, imperfect, hand-drawn line work and softly rounded corners — NOT a ruler-straight mechanical rectangle. Leave an even WHITE MARGIN (safe area) between that frame and the outer image edges so NO line or content touches the outer edge. Keep all artwork INSIDE the frame; the area outside the frame stays plain white.";

/** Strip the coloring-page frame so colorize / cover output is full-bleed. */
export const REMOVE_FRAME_INSTRUCTION =
  "If the source image has a hand-drawn square frame with an outer white margin, IGNORE and REMOVE that frame — extend the artwork full-bleed edge-to-edge with NO frame, border, outline or margin on any side.";

/**
 * Whether B&W coloring-page generation should draw the KDP-safe frame.
 * Toggle with env COLORING_PAGE_FRAME: default ON; set "0" / "false" / "off" to
 * disable (pages then generate full-bleed, no frame).
 */
export function isFrameEnabled(): boolean {
  const v = (process.env.COLORING_PAGE_FRAME ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

/** Frame instruction when enabled (default on), else empty string. */
export function frameInstruction(): string {
  return isFrameEnabled() ? KDP_FRAME_INSTRUCTION : "";
}
