#!/usr/bin/env tsx

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AssetDownloadService } from '../src/lib/asset-download-service';

interface EditionPdfOptions {
  assetsDir: string;
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(): EditionPdfOptions {
  const args = process.argv.slice(2);

  const options: EditionPdfOptions = {
    assetsDir: AssetDownloadService.getAssetsBaseDir(),
    limit: null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--assets-dir':
        if (next) {
          options.assetsDir = path.isAbsolute(next)
            ? next
            : path.join(process.cwd(), next);
          i++;
        }
        break;
      case '--limit':
        if (next && /^\d+$/.test(next)) {
          options.limit = parseInt(next, 10);
          i++;
        }
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
    }
  }

  return options;
}

function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findEditionPdf(listingDir: string): string | null {
  const pdfDir = path.join(listingDir, 'pdfs');
  if (!fs.existsSync(pdfDir)) return null;

  const pdfFiles = fs
    .readdirSync(pdfDir)
    .filter((name) => name.toLowerCase().endsWith('.pdf'));

  if (pdfFiles.length === 0) return null;

  const editionPdf = pdfFiles.find((name) =>
    name.toLowerCase().includes('edition')
  );

  if (!editionPdf) return null;

  return path.join(pdfDir, editionPdf);
}

function hasEditionImages(listingDir: string): boolean {
  const outputDir = path.join(listingDir, 'edition-images');
  if (!fs.existsSync(outputDir)) return false;

  const files = fs.readdirSync(outputDir);
  return files.some((name) => {
    const lower = name.toLowerCase();
    return (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp')
    );
  });
}

function convertEditionPdfToImages(
  listingId: string,
  pdfPath: string,
  listingDir: string,
  dryRun: boolean
): void {
  const outputDir = path.join(listingDir, 'edition-images');
  ensureDirectory(outputDir);

  const outputPattern = path.join(outputDir, 'page-%03d.png');
  const command = `magick -density 300 "${pdfPath}" -quality 100 "${outputPattern}"`;

  console.log(`\n[${listingId}] Converting edition PDF -> edition-images`);
  console.log(`PDF: ${pdfPath}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Command: ${command}`);

  if (dryRun) {
    console.log('Dry-run mode: skipping ImageMagick execution.');
    return;
  }

  try {
    execSync(command, { stdio: 'inherit' });
    const generated = fs
      .readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith('.png'));
    console.log(
      `[${listingId}] Generated ${generated.length} edition image(s) in ${outputDir}`
    );
  } catch (error) {
    console.error(`[${listingId}] Error converting edition PDF:`, error);
  }
}

function run(): void {
  const options = parseArgs();
  const assetsDir = options.assetsDir;

  console.log('=== Edition PDF → Edition Images ===');
  console.log('Assets dir:', assetsDir);
  console.log('Dry run:', options.dryRun ? 'yes' : 'no');
  if (options.limit !== null) {
    console.log('Limit:', options.limit);
  }

  if (!fs.existsSync(assetsDir)) {
    console.error(`Assets directory does not exist: ${assetsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  const listingDirs = entries.filter((e) => e.isDirectory());

  let processed = 0;
  let converted = 0;
  let skippedNoEdition = 0;
  let skippedExisting = 0;

  for (const dirent of listingDirs) {
    if (options.limit !== null && processed >= options.limit) {
      break;
    }

    const listingId = dirent.name;
    const listingDir = path.join(assetsDir, listingId);

    processed++;

    const editionPdfPath = findEditionPdf(listingDir);
    if (!editionPdfPath) {
      skippedNoEdition++;
      console.log(
        `[${listingId}] Skip: no PDF filename containing "edition" found.`
      );
      continue;
    }

    if (hasEditionImages(listingDir)) {
      skippedExisting++;
      console.log(
        `[${listingId}] Skip: edition-images already exist (at least one image file present).`
      );
      continue;
    }

    convertEditionPdfToImages(
      listingId,
      editionPdfPath,
      listingDir,
      options.dryRun
    );
    converted++;
  }

  console.log('\n=== Summary ===');
  console.log('Listings scanned:', processed);
  console.log('Converted (editionPdf → edition-images):', converted);
  console.log('Skipped (no edition PDF):', skippedNoEdition);
  console.log('Skipped (edition-images already exist):', skippedExisting);
}

run();

