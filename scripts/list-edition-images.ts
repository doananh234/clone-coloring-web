#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { AssetDownloadService } from '../src/lib/asset-download-service';

interface EditionImagesListOptions {
  assetsDir: string;
  limit: number | null;
  onlyWithEditionPdf: boolean;
}

function parseArgs(): EditionImagesListOptions {
  const args = process.argv.slice(2);

  const options: EditionImagesListOptions = {
    assetsDir: AssetDownloadService.getAssetsBaseDir(),
    limit: null,
    onlyWithEditionPdf: true,
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
      case '--all':
        options.onlyWithEditionPdf = false;
        break;
    }
  }

  return options;
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

function countEditionImages(listingDir: string): { hasFolder: boolean; count: number } {
  const outputDir = path.join(listingDir, 'edition-images');
  if (!fs.existsSync(outputDir)) {
    return { hasFolder: false, count: 0 };
  }

  const files = fs.readdirSync(outputDir);
  const count = files.filter((name) => {
    const lower = name.toLowerCase();
    return (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp')
    );
  }).length;

  return { hasFolder: true, count };
}

function run(): void {
  const options = parseArgs();
  const assetsDir = options.assetsDir;

  console.log('=== Edition Images Listing ===');
  console.log('Assets dir:', assetsDir);
  console.log(
    'Mode:',
    options.onlyWithEditionPdf
      ? 'only listings that have an "edition" PDF'
      : 'all listings'
  );
  if (options.limit !== null) {
    console.log('Limit:', options.limit);
  }
  console.log('');

  if (!fs.existsSync(assetsDir)) {
    console.error(`Assets directory does not exist: ${assetsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  const listingDirs = entries.filter((e) => e.isDirectory());

  let scanned = 0;
  let withEditionPdf = 0;
  let withImages = 0;
  let withoutImages = 0;

  for (const dirent of listingDirs) {
    if (options.limit !== null && scanned >= options.limit) {
      break;
    }

    const listingId = dirent.name;
    const listingDir = path.join(assetsDir, listingId);

    const editionPdfPath = findEditionPdf(listingDir);
    if (!editionPdfPath && options.onlyWithEditionPdf) {
      continue;
    }

    scanned++;
    const { hasFolder, count } = countEditionImages(listingDir);

    if (editionPdfPath) {
      withEditionPdf++;
    }

    if (count > 0) {
      withImages++;
    } else {
      withoutImages++;
    }

    const editionPdfName = editionPdfPath
      ? path.basename(editionPdfPath)
      : 'NO_EDITION_PDF';

    console.log(
      `[${listingId}] editionPdf: ${editionPdfName} | edition-images folder: ${
        hasFolder ? 'yes' : 'no'
      } | image count: ${count}`
    );
  }

  console.log('\n=== Summary ===');
  console.log('Listings scanned:', scanned);
  console.log('Listings with edition PDF:', withEditionPdf);
  console.log('Listings with edition-images > 0:', withImages);
  console.log('Listings with 0 edition-images:', withoutImages);
}

run();

