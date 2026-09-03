/**
 * One-page smoke test of the "leave Diaflow" combo the operator asked about:
 *   analyze step  → Azure   (LLM_PROVIDER unset)
 *   reproduce step → KingCong (IMAGE_PROVIDER=kingcong)
 *
 * Mirrors the multi-step pipeline (stepAnalyze + stepReproduce) for ONE page,
 * so it needs no DB / Redis / BullMQ. Renders page 1 of the given PDF, runs the
 * real CLONE_EXTRACTION_PROMPT analyze on Azure, then the real redesign editImage
 * on KingCong, and writes the redesigned PNG to disk.
 *
 * Run: node --env-file=.env --import tsx src/scripts/clone-combo-test.ts <pdfUrl>
 */
import { writeFile } from "node:fs/promises";

import { renderPdfToImages } from "@vx/server-core/pdf-renderer";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";
import { CLONE_EXTRACTION_PROMPT, buildReproductionPrompt, buildRedesignPrompt } from "@vx/server-core/ai/prompts";
import { editImage } from "@vx/server-core/ai";

function ms(label: string, start: number): string {
  return `${label}: ${((Date.now() - start) / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  // Force the exact combo under test, regardless of what .env says.
  process.env.LLM_PROVIDER = ""; // empty → Azure for analyze/vision
  process.env.IMAGE_PROVIDER = "kingcong"; // KingCong for reproduce

  const pdfUrl = process.argv[2];
  if (!pdfUrl) throw new Error("Usage: clone-combo-test.ts <pdfUrl>");

  console.log(`▶ combo test — analyze=Azure, image=KingCong`);
  console.log(`  PDF: ${pdfUrl}`);

  // 1) Fetch + render PDF
  let t = Date.now();
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`fetch PDF failed: ${res.status}`);
  const pdfBuf = await res.arrayBuffer();
  const pages = await renderPdfToImages(pdfBuf);
  console.log(`✅ render: ${pages.length} pages (${ms("t", t)})`);
  if (!pages.length) throw new Error("PDF rendered 0 pages");

  const page = pages[0]!;
  const dataUrl = `data:image/png;base64,${page.pngBuffer.toString("base64")}`;
  console.log(`  page 1: ${page.width}×${page.height}, ${(page.pngBuffer.length / 1024).toFixed(0)}KB`);

  // 2) ANALYZE on Azure (real prompt used by stepAnalyze). NON-FATAL: the
  //    reproduce step does not consume analyze output (generatePage uses only
  //    buildRedesignPrompt), so a broken analyze backend must not block the
  //    KingCong image test — we just report it.
  t = Date.now();
  try {
    const extracted = await visionAnalyzeJSON<{
      characters?: unknown[];
      locations?: unknown[];
      props?: unknown[];
    }>(dataUrl, CLONE_EXTRACTION_PROMPT, {
      maxTokens: 4000,
      temperature: 0.3,
      trace: { caller: "combo-test/analyze", entityType: "cloneJob", entityId: "combo-test" },
    });
    console.log(`✅ analyze (Azure): ${ms("t", t)}`);
    console.log(`   characters=${(extracted.characters ?? []).length} locations=${(extracted.locations ?? []).length} props=${(extracted.props ?? []).length}`);
    console.log(`   reproductionPrompt: ${buildReproductionPrompt(extracted).length} chars`);
    await writeFile("combo-test-analyze.json", JSON.stringify(extracted, null, 2));
  } catch (e) {
    console.log(`⚠️  analyze (Azure) FAILED: ${(e as Error).message?.split("\n")[0]}`);
    console.log(`   → not blocking; reproduce does not depend on analyze output.`);
  }

  // 3) REPRODUCE on KingCong (real redesign prompt used by stepReproduce)
  t = Date.now();
  const redesignPrompt = buildRedesignPrompt(30);
  const img = await editImage(dataUrl, redesignPrompt, {
    trace: { caller: "combo-test/reproduce", entityType: "cloneJob", entityId: "combo-test" },
  });
  const out = "combo-test-redesigned.png";
  await writeFile(out, Buffer.from(img.base64, "base64"));
  console.log(`✅ reproduce (KingCong): ${ms("t", t)} → ${out} (${(img.base64.length / 1024).toFixed(0)}KB b64)`);

  console.log(`\n🎉 DONE — analyze JSON: combo-test-analyze.json | redesigned page: ${out}`);
}

main().catch((err) => {
  console.error("❌ FAILED:", err?.message || err);
  if (err?.stack) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
  process.exit(1);
});
