/**
 * Smoke-test the KingCong image provider via the shared facade. Verifies the
 * whole path: create_task → poll → download → base64. Uses IMAGE_PROVIDER=kingcong
 * regardless of the env default so you can test it in isolation.
 *
 * Run:  node --env-file=.env --import tsx src/scripts/kingcong-image-test.ts "<prompt>" [sourceImageUrl]
 */
import { writeFile } from "node:fs/promises";

import { generateImage, editImage } from "@vx/server-core/ai";

async function main(): Promise<void> {
  process.env.IMAGE_PROVIDER = "kingcong";
  const prompt =
    process.argv[2] ||
    "A simple black-and-white coloring book page of a happy cat, bold clean outlines, empty interiors.";
  const sourceUrl = process.argv[3];

  console.log(`▶ IMAGE_PROVIDER=kingcong | prompt: ${prompt.slice(0, 70)}...`);
  const img = sourceUrl
    ? await editImage(sourceUrl, prompt)
    : await generateImage(prompt);

  const out = "kingcong-test-output.jpg";
  await writeFile(out, Buffer.from(img.base64, "base64"));
  console.log(`✅ Xong. base64 length=${img.base64.length}. Đã lưu ${out}`);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
