#!/usr/bin/env tsx
/**
 * Background script: run redesign + upload to Firebase for each crawled asset (id by id).
 * No UI required — processes assets one by one.
 *
 * Prerequisites:
 *   - Dashboard API must be running (e.g. yarn dev).
 *   - DIAFLOW_API_KEY and Firebase env configured for the dashboard.
 *
 * Usage:
 *   yarn redesign-all
 *   yarn redesign-all --base-url http://localhost:4003
 *   yarn redesign-all --not-redesigned-only --limit 5
 *   yarn redesign-all --delay 2000 --is-public true
 *
 * Options:
 *   --base-url URL     Dashboard base URL (default: http://localhost:3000)
 *   --not-redesigned-only  Only process assets that don't already have Diaflow images in Firebase
 *   --limit N          Process at most N assets (default: all)
 *   --delay MS         Delay in ms between each asset (default: 0)
 *   --is-public true|false  Set isPublic on created/updated listings (default: true)
 */

const DEFAULT_BASE_URL = 'http://localhost:4003';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_WAIT_MS = 600_000; // 10 min

interface CrawledAssetItem {
  listingId: string;
  itemName: string | null;
  metadataFiles: { name: string }[];
  pdfs: { name: string }[];
  images: { name: string }[];
}

interface RedesignAllOptions {
  baseUrl: string;
  notRedesignedOnly: boolean;
  limit: number;
  delayMs: number;
  isPublic: boolean;
}

function parseArgs(): RedesignAllOptions {
  const args = process.argv.slice(2);
  const options: RedesignAllOptions = {
    baseUrl: process.env.REDESIGN_BASE_URL || DEFAULT_BASE_URL,
    notRedesignedOnly: false,
    limit: Number.MAX_SAFE_INTEGER,
    delayMs: 0,
    isPublic: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--base-url':
        if (next) {
          options.baseUrl = next;
          i++;
        }
        break;
      case '--not-redesigned-only':
        options.notRedesignedOnly = true;
        break;
      case '--limit':
        if (next && /^\d+$/.test(next)) {
          options.limit = parseInt(next, 10);
          i++;
        }
        break;
      case '--delay':
        if (next && /^\d+$/.test(next)) {
          options.delayMs = parseInt(next, 10);
          i++;
        }
        break;
      case '--is-public':
        if (next === 'true') {
          options.isPublic = true;
          i++;
        } else if (next === 'false') {
          options.isPublic = false;
          i++;
        }
        break;
    }
  }
  return options;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAssets(baseUrl: string): Promise<CrawledAssetItem[]> {
  const res = await fetch(`${baseUrl}/api/assets`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET /api/assets failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.assets)) return [];
  return data.assets;
}

async function getRedesignedListingIds(baseUrl: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${baseUrl}/api/listings?hasDiaflowImages=true`);
    if (!res.ok) return new Set();
    const data = await res.json();
    if (!Array.isArray(data.listings)) return new Set();
    return new Set(
      data.listings
        .map((l: { listingId?: string }) => l.listingId)
        .filter((id: unknown): id is string => typeof id === 'string')
    );
  } catch {
    return new Set();
  }
}

function pickFiles(asset: CrawledAssetItem): { metadataFile: string; thumbnailImage: string; pdfFile: string } | null {
  const metadataFile = asset.metadataFiles[0]?.name;
  const thumbnailImage = asset.images[0]?.name;
  const editionPdf = asset.pdfs.find((p) => p.name.toLowerCase().includes('edition'));
  const pdfFile = editionPdf?.name;
  if (!metadataFile || !thumbnailImage || !pdfFile) return null;
  return { metadataFile, thumbnailImage, pdfFile };
}

async function triggerRedesign(
  baseUrl: string,
  listingId: string,
  metadataFile: string,
  thumbnailImage: string,
  pdfFile: string
): Promise<{ thumbnail?: string }> {
  const res = await fetch(`${baseUrl}/api/redesign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId,
      metadataFile,
      thumbnailImage,
      pdfFile,
    }),
  });
  const data = await res.json();
  console.log('data', data);
  if (!res.ok) {
    throw new Error(data.error || `POST /api/redesign failed: ${res.status}`);
  }
  const parsed = data.parsed || {};
  return { thumbnail: parsed.thumbnail };
}

async function updateFirebase(
  baseUrl: string,
  listingId: string,
  thumbnail: string | undefined,
  images: string[],
  isPublic: boolean
): Promise<void> {
  if (!thumbnail && images.length === 0) {
    throw new Error('No thumbnail or images to send to Firebase');
  }
  const res = await fetch(`${baseUrl}/api/redesign/update-firebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId,
      thumbnail: thumbnail || (images[0] ?? ''),
      images,
      isPublic,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.hint || `POST /api/redesign/update-firebase failed: ${res.status}`);
  }
}

async function run(): Promise<void> {
  const options = parseArgs();
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  console.log('[redesign-all] Options:', options);
  console.log('[redesign-all] Fetching assets from', `${baseUrl}/api/assets`);

  let assets = await getAssets(baseUrl);
  if (options.notRedesignedOnly) {
    const redesignedIds = await getRedesignedListingIds(baseUrl);
    assets = assets.filter((a) => !redesignedIds.has(a.listingId));
    console.log('[redesign-all] Filtered to not-yet-redesigned:', assets.length);
  }

  const toProcess = assets.slice(0, options.limit);
  console.log('[redesign-all] Will process', toProcess.length, 'asset(s)');

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const asset = toProcess[i];
    const files = pickFiles(asset);
    if (!files) {
      console.log(`[${i + 1}/${toProcess.length}] Skip ${asset.listingId}: missing metadata/thumbnail/edition PDF`);
      continue;
    }

    if (i > 0 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }

    try {
      console.log(`[${i + 1}/${toProcess.length}] ${asset.listingId} — trigger redesign (Ark)...`);
      const { thumbnail } = await triggerRedesign(
        baseUrl,
        asset.listingId,
        files.metadataFile,
        files.thumbnailImage,
        files.pdfFile
      );
      console.log(
        `[${i + 1}/${toProcess.length}] ${asset.listingId} — updating Firebase from Ark thumbnail...`
      );
      await updateFirebase(baseUrl, asset.listingId, thumbnail, [], options.isPublic);
      console.log(`[${i + 1}/${toProcess.length}] ${asset.listingId} — OK`);
      ok++;
    } catch (err) {
      console.error(`[${i + 1}/${toProcess.length}] ${asset.listingId} — ERROR:`, err instanceof Error ? err.message : err);
      fail++;
    }
  }

  console.log('[redesign-all] Done. OK:', ok, 'Failed:', fail);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
