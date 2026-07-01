/**
 * Redesign Prompts — image-to-image redesign template for clone flow.
 */

export function buildRedesignPrompt(changePercent: number): string {
  const pct = changePercent || 30;
  return `This is a black-and-white coloring book page for young children. Generate
a refreshed variation (~${pct}% change) of this image.

KEEP unchanged:
- Line-art style and line weight (identical drawing technique)
- Character identity: same species, same face, same art style
- Overall scene type / setting context
- Children's coloring book aesthetic: bold clean outlines, large EMPTY
  white interiors inside every shape, minimal interior detail

MAY CHANGE freely:
- Character pose, posture, and viewing angle
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
