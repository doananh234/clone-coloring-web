#!/usr/bin/env tsx

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { AssetDownloadService } from '../src/lib/asset-download-service';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

async function mergeListingRedesignEditionImagesToPdf(
  listingId: string,
  assetsDir: string
): Promise<{ success: boolean; pageCount?: number; outputPath?: string; error?: string }> {
  try {
    const listingDir = path.join(assetsDir, listingId);
    const redesignEditionDir = path.join(listingDir, 'redesign-edition-images');
    const redesignDir = path.join(listingDir, 'redesign');

    if (!fs.existsSync(redesignEditionDir)) {
      return {
        success: false,
        error: 'No redesign-edition-images directory found',
      };
    }

    const files = await fsp.readdir(redesignEditionDir);
    const imageFiles = files
      .filter((name) => {
        const lower = name.toLowerCase();
        return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
      })
      .sort();

    if (imageFiles.length === 0) {
      return {
        success: false,
        error: 'No images found in redesign-edition-images',
      };
    }

    const pdfDoc = await PDFDocument.create();

    for (const filename of imageFiles) {
      const filePath = path.join(redesignEditionDir, filename);
      const buffer = await fsp.readFile(filePath);
      const ext = path.extname(filename).toLowerCase();

      let embeddedImage;
      if (ext === '.png' || ext === '.webp') {
        embeddedImage = await pdfDoc.embedPng(buffer);
      } else {
        embeddedImage = await pdfDoc.embedJpg(buffer);
      }

      const { width, height } = embeddedImage;
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    await fsp.mkdir(redesignDir, { recursive: true });
    const outputPath = path.join(redesignDir, 'redesign-edition.pdf');
    await fsp.writeFile(outputPath, pdfBytes);

    return {
      success: true,
      pageCount: imageFiles.length,
      outputPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function main() {
  const assetsDir = AssetDownloadService.getAssetsBaseDir();

  const listings = await fsp.readdir(assetsDir);
  for (const listingId of listings) {
    const listingDir = path.join(assetsDir, listingId);
    const stat = await fsp.stat(listingDir);
    if (!stat.isDirectory()) continue;

    const redesignEditionDir = path.join(listingDir, 'redesign-edition-images');
    if (!fs.existsSync(redesignEditionDir)) {
      continue;
    }

    console.log(`\n[${listingId}] Merging redesign-edition-images to PDF...`);
    const result = await mergeListingRedesignEditionImagesToPdf(
      listingId,
      assetsDir
    );

    if (result.success) {
      console.log(
        `[${listingId}] Created ${result.pageCount} page(s) PDF at ${result.outputPath}`
      );
    } else {
      console.warn(
        `[${listingId}] Failed to create PDF: ${result.error ?? 'Unknown error'}`
      );
    }
  }

  console.log('\nDone merging redesign-edition-images to PDFs.');
}

main().catch((err) => {
  console.error('Fatal error in merge-redesign-edition-images-to-pdf:', err);
  process.exit(1);
});

