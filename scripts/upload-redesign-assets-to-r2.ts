#!/usr/bin/env tsx

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { db } from '../src/lib/firebase-admin';
import { AssetDownloadService } from '../src/lib/asset-download-service';
import { createR2Client, getR2ConfigFromEnv, putObjectToR2 } from '../src/lib/r2';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const THUMBNAIL_CANDIDATES = [
  'thumbnail.png',
  'thumbnail.jpg',
  'thumbnail.jpeg',
  'thumbnail.webp',
  'thumbnail.gif',
];

interface Options {
  assetsDir: string;
  listingId: string | null;
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    assetsDir: AssetDownloadService.getAssetsBaseDir(),
    listingId: null,
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
      case '--listing-id':
        if (next) {
          options.listingId = next;
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

async function uploadOneListing(params: {
  listingId: string;
  assetsDir: string;
  dryRun: boolean;
}): Promise<void> {
  const { listingId, assetsDir, dryRun } = params;

  const listingDir = path.join(assetsDir, listingId);
  const redesignEditionDir = path.join(listingDir, 'redesign-edition-images');
  const redesignDir = path.join(listingDir, 'redesign');
  const pdfPath = path.join(listingDir, 'redesign', 'redesign-edition.pdf');

  if (!fs.existsSync(redesignEditionDir)) {
    console.log(`[${listingId}] Skip: missing redesign-edition-images`);
    return;
  }
  if (!fs.existsSync(pdfPath)) {
    console.log(`[${listingId}] Skip: missing redesign/redesign-edition.pdf`);
    return;
  }

  const files = (await fsp.readdir(redesignEditionDir))
    .filter((name) =>
      IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
    )
    .sort();

  if (files.length === 0) {
    console.log(`[${listingId}] Skip: no images in redesign-edition-images`);
    return;
  }

  const config = getR2ConfigFromEnv();
  const client = createR2Client(config);

  console.log(`[${listingId}] Uploading ${files.length} image(s) + PDF to R2...`);

  // Optional: upload redesign thumbnail
  let thumbnailUrl: string | null = null;
  for (const name of THUMBNAIL_CANDIDATES) {
    const p = path.join(redesignDir, name);
    if (!fs.existsSync(p)) continue;
    const key = `assets/${listingId}/redesign/${name}`;
    if (!dryRun) {
      const buf = await fsp.readFile(p);
      thumbnailUrl = (await putObjectToR2({ client, config, key, body: buf })).url;
    } else {
      thumbnailUrl = '(dry-run)';
    }
    break;
  }

  const uploadedImages: Array<{ filename: string; url: string }> = [];

  for (const filename of files) {
    const localPath = path.join(redesignEditionDir, filename);
    const key = `assets/${listingId}/redesign-edition-images/${filename}`;

    if (!dryRun) {
      const buf = await fsp.readFile(localPath);
      const result = await putObjectToR2({ client, config, key, body: buf });
      uploadedImages.push({ filename, url: result.url });
    } else {
      uploadedImages.push({ filename, url: '(dry-run)' });
    }
  }

  const pdfKey = `assets/${listingId}/redesign/redesign-edition.pdf`;
  const pdfUrl = dryRun
    ? '(dry-run)'
    : (
        await putObjectToR2({
          client,
          config,
          key: pdfKey,
          body: await fsp.readFile(pdfPath),
          contentType: 'application/pdf',
        })
      ).url;

  const imagesForFirestore = uploadedImages.map((img) => ({
    url: img.url,
    thumbnail: img.url,
    isRedesign: true,
  }));

  if (thumbnailUrl) {
    imagesForFirestore.unshift({
      url: thumbnailUrl,
      thumbnail: thumbnailUrl,
      isRedesign: true,
    });
  }

  if (!dryRun) {
    await db
      .collection('listings')
      .doc(listingId)
      .set(
        {
          listingData: {
            images: imagesForFirestore,
            redesignEditionPdfUrl: pdfUrl,
            redesignThumbnailUrl: thumbnailUrl,
          },
        },
        { merge: true }
      );
  }

  console.log(
    `[${listingId}] Done. Firestore images=${imagesForFirestore.length}, pdf=${pdfUrl}, thumbnail=${thumbnailUrl ?? 'none'}`
  );
}

async function main() {
  const options = parseArgs();

  // Ensure scripts can use the same assets base dir resolution as app
  AssetDownloadService.setAssetsBaseDir(options.assetsDir);

  const listingIds = options.listingId
    ? [options.listingId]
    : (await fsp.readdir(options.assetsDir)).filter((name) => {
        const full = path.join(options.assetsDir, name);
        try {
          return fs.statSync(full).isDirectory();
        } catch {
          return false;
        }
      });

  const limited =
    options.limit != null ? listingIds.slice(0, options.limit) : listingIds;

  for (const listingId of limited) {
    await uploadOneListing({
      listingId,
      assetsDir: options.assetsDir,
      dryRun: options.dryRun,
    });
  }
}

main().catch((err) => {
  console.error('Fatal error in upload-redesign-assets-to-r2:', err);
  process.exit(1);
});

