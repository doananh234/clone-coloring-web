#!/usr/bin/env tsx
/**
 * Crawler Script - Local Asset Downloader
 * Standalone script to crawl listings and download assets locally
 * No Firebase/Google Cloud authentication required - pure local file download
 * 
 * Usage:
 *   yarn tsx scripts/crawl.ts
 *   yarn tsx scripts/crawl.ts --limit 10
 *   yarn tsx scripts/crawl.ts --api-url "https://api.example.com/listings"
 *   yarn tsx scripts/crawl.ts --limit 50 --api-key "your-api-key"
 * 
 * Output:
 *   Files are saved to: assets/{listingId}/pdfs/ and assets/{listingId}/images/
 */

import { AssetDownloadService } from '../src/lib/asset-download-service';
import { Listing, ListingApiResponse } from '../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Default API endpoint
const DEFAULT_LISTING_API_URL =
  'https://local-dev.ansoviet.com/api/v1/listings?limit=50&sort=-_id&filter=%7B%22isParent%22:true%7D&populate=user,user.team,store,itemType,newTags&fields=user.email,user.team.name,store.siteName,store.domain,itemType.name';

// Default headers
const DEFAULT_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-GB,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5,en-US;q=0.4',
  referer: 'https://local-dev.ansoviet.com/listings',
  'sec-ch-ua':
    '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-api-key': 'ow84skkss8koo80ooww4k048kww0kksw0488cwc8',
  authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MzI5N2IxYjc5MTFiZTgwODU3ZTMyMjEiLCJpYXQiOjE3Njg0NjczNDYsImV4cCI6MTc2OTMzMTM0NiwidHlwZSI6ImFjY2VzcyJ9.vWOh9u1uwBtcqzskGNPo_Vg3bC0qwEkLjTp9Bd4Vunw',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
};

interface CrawlerOptions {
  apiUrl?: string;
  authorization?: string;
  apiKey?: string;
  limit?: number;
  maxPages?: number; // Maximum number of pages to fetch (default: unlimited/all pages)
  page?: number; // Start from specific page (default: 1)
  fromMetadata?: boolean; // If true, read assets/*/metadata.json instead of calling listings API
  assetsDir?: string; // Override assets directory (default: {cwd}/assets)
  maxListings?: number; // Limit number of listings to process (applies to --from-metadata)
}

/**
 * Parse command line arguments
 */
function parseArgs(): CrawlerOptions {
  const args = process.argv.slice(2);
  const options: CrawlerOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--api-url':
      case '-u':
        if (nextArg) {
          options.apiUrl = nextArg;
          i++;
        }
        break;
      case '--authorization':
      case '-a':
        if (nextArg) {
          options.authorization = nextArg;
          i++;
        }
        break;
      case '--api-key':
      case '-k':
        if (nextArg) {
          options.apiKey = nextArg;
          i++;
        }
        break;
      case '--limit':
      case '-l':
        if (nextArg) {
          options.limit = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--from-metadata':
        options.fromMetadata = true;
        break;
      case '--assets-dir':
        if (nextArg) {
          options.assetsDir = nextArg;
          i++;
        }
        break;
      case '--max-listings':
        if (nextArg) {
          options.maxListings = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--max-pages':
      case '-p':
        if (nextArg) {
          options.maxPages = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--page':
        if (nextArg) {
          options.page = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--help':
      case '-h':
        console.log(`
Crawler Script - Local Asset Downloader
Downloads PDFs and images to local assets/ folder
No Firebase/Google Cloud authentication required

Usage:
  yarn tsx scripts/crawl.ts [options]

Options:
  --from-metadata            Read assets/*/metadata.json and download from public URLs only (no API calls)
  --assets-dir <path>        Override assets directory (default: ./assets)
  --max-listings <number>    Limit number of listings processed in --from-metadata mode
  --api-url, -u <url>        Override default API URL
  --authorization, -a <token> Override authorization header
  --api-key, -k <key>        Override x-api-key header
  --limit, -l <number>      Limit per page (default: 50)
  --max-pages, -p <number>   Maximum pages to fetch (default: all pages)
  --page <number>            Start from specific page (default: 1)
  --help, -h                 Show this help message

Examples:
  yarn tsx scripts/crawl.ts --from-metadata    # Download only from assets/*/metadata.json (no API calls)
  yarn tsx scripts/crawl.ts                    # Fetch all pages from API
  yarn tsx scripts/crawl.ts --limit 100        # Fetch all pages with 100 per page
  yarn tsx scripts/crawl.ts --max-pages 5      # Fetch only first 5 pages
  yarn tsx scripts/crawl.ts --page 2           # Start from page 2

Output:
  Files are saved to:
    - assets/{listingId}/metadata.json (API response data)
    - assets/{listingId}/pdfs/ (PDF files)
    - assets/{listingId}/images/ (Image files)
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load listings from assets/{listingId}/metadata.json.
 * This is useful when asset URLs are public and you want to avoid calling the listings API.
 */
async function loadListingsFromMetadata(
  assetsDir: string,
  maxListings?: number
): Promise<Listing[]> {
  const dirEntries = await fs.readdir(assetsDir, { withFileTypes: true });
  const listingDirs = dirEntries.filter((d) => d.isDirectory());

  const listings: Listing[] = [];
  for (const dirent of listingDirs) {
    if (maxListings !== undefined && listings.length >= maxListings) {
      break;
    }

    const metadataPath = path.join(assetsDir, dirent.name, 'metadata.json');
    if (!(await fileExists(metadataPath))) {
      continue;
    }

    try {
      const raw = await fs.readFile(metadataPath, 'utf8');
      const parsed = JSON.parse(raw) as Listing;

      // Ensure listing has an id; fall back to folder name.
      const listing = {
        ...parsed,
        _id: parsed?._id || dirent.name,
      } as Listing;

      listings.push(listing);
    } catch (error) {
      console.warn(
        `⚠️  Failed to read/parse metadata: ${metadataPath}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return listings;
}

/**
 * Build URL with pagination parameters
 */
function buildUrl(
  baseUrl: string,
  page: number,
  limit?: number
): string {
  try {
    const url = new URL(baseUrl);
    
    // Set page parameter
    url.searchParams.set('page', page.toString());
    
    // Set limit if provided
    if (limit) {
      url.searchParams.set('limit', limit.toString());
    } else if (!url.searchParams.has('limit')) {
      // Default limit if not in URL
      url.searchParams.set('limit', '50');
    }
    
    return url.toString();
  } catch {
    // If URL parsing fails, try manual string manipulation
    let url = baseUrl;
    
    // Remove existing page parameter if present
    url = url.replace(/[?&]page=\d+/g, '');
    
    // Remove existing limit if we're setting a new one
    if (limit) {
      url = url.replace(/[?&]limit=\d+/g, '');
    }
    
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}page=${page}`;
    
    if (limit) {
      url = `${url}&limit=${limit}`;
    } else if (!baseUrl.includes('limit=')) {
      url = `${url}&limit=50`;
    }
    
    return url;
  }
}

/**
 * Fetch a single page of listings
 */
async function fetchPage(
  baseUrl: string,
  page: number,
  headers: Record<string, string>,
  limit?: number
): Promise<{ data: ListingApiResponse; hasMore: boolean; totalPages?: number }> {
  const url = buildUrl(baseUrl, page, limit);
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed (page ${page}): ${response.status} - ${errorText}`);
  }

  const data: ListingApiResponse = await response.json();
  
  if (!data.results || !Array.isArray(data.results)) {
    throw new Error(`Invalid API response format on page ${page}`);
  }

  // Check pagination info - common patterns:
  // - data.page, data.pageCount, data.total
  // - data.pagination.page, data.pagination.pageCount
  // - data.hasMore
  const responseData = data as ListingApiResponse & {
    page?: number;
    pageCount?: number;
    totalPages?: number;
    total?: number;
    hasMore?: boolean;
    pagination?: {
      page?: number;
      pageCount?: number;
      total?: number;
    };
  };
  
  const currentPage = responseData.page || responseData.pagination?.page || page;
  const pageCount = responseData.pageCount || responseData.pagination?.pageCount || responseData.totalPages;
  const hasMore = responseData.hasMore !== undefined 
    ? responseData.hasMore 
    : (pageCount ? currentPage < pageCount : data.results.length > 0);

  return {
    data,
    hasMore: hasMore && data.results.length > 0,
    totalPages: pageCount,
  };
}

/**
 * Main crawler function
 */
async function crawl(options: CrawlerOptions = {}) {
  try {
    const assetsDir = options.assetsDir || path.join(process.cwd(), 'assets');
    AssetDownloadService.setAssetsBaseDir(assetsDir);

    // Build headers
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...((options.authorization || process.env.CRAWL_AUTHORIZATION) && {
        authorization: options.authorization || process.env.CRAWL_AUTHORIZATION!,
      }),
      ...((options.apiKey || process.env.CRAWL_API_KEY) && {
        'x-api-key': options.apiKey || process.env.CRAWL_API_KEY!,
      }),
    };

    // Get base URL
    const baseUrl = options.apiUrl || DEFAULT_LISTING_API_URL;
    const startPage = options.page || 1;
    const maxPages = options.maxPages || Infinity;
    const limit = options.limit;

    console.log('🕷️  Starting crawler...');
    if (options.fromMetadata) {
      console.log('📁 Mode: from local metadata (no API calls)');
      console.log('📁 Assets dir:', assetsDir);
      if (options.maxListings !== undefined) {
        console.log(`📋 Max listings: ${options.maxListings}`);
      }
    } else {
      console.log('📡 Base API URL:', baseUrl);
      console.log(`📄 Starting from page: ${startPage}`);
      if (maxPages !== Infinity) {
        console.log(`📄 Maximum pages to fetch: ${maxPages}`);
      } else {
        console.log('📄 Fetching all pages');
      }
      if (limit) {
        console.log(`📄 Limit per page: ${limit}`);
      }
    }
    console.log('');

    // Collect all listings from all pages
    const allListings: Listing[] = [];
    let currentPage = startPage;
    let hasMore = true;
    let totalPages: number | undefined;
    let totalListings = 0;

    if (options.fromMetadata) {
      if (!(await fileExists(assetsDir))) {
        console.log(`⚠️  Assets directory not found: ${assetsDir}`);
        process.exit(1);
      }

      const listings = await loadListingsFromMetadata(
        assetsDir,
        options.maxListings
      );
      allListings.push(...listings);
      totalListings = listings.length;
      console.log(`📦 Loaded ${totalListings} listing(s) from metadata.json`);
      console.log('');
    } else {
      // Fetch all pages
      while (hasMore && currentPage - startPage < maxPages) {
        console.log(`\n📥 Fetching page ${currentPage}...`);

        const { data, hasMore: more, totalPages: pages } = await fetchPage(
          baseUrl,
          currentPage,
          headers,
          limit
        );

        if (pages) {
          totalPages = pages;
        }

        const pageListings = data.results || [];
        allListings.push(...pageListings);
        totalListings += pageListings.length;

        console.log(
          `  ✅ Fetched ${pageListings.length} listings from page ${currentPage}`
        );
        if (totalPages) {
          console.log(
            `  📊 Total pages: ${totalPages}, Current: ${currentPage}/${totalPages}`
          );
        }

        hasMore = more;
        currentPage++;

        // Small delay to avoid overwhelming the API
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log(
        `\n📦 Total fetched: ${totalListings} listings from ${currentPage - startPage} page(s)`
      );
      console.log('');
    }

    if (allListings.length === 0) {
      console.log('⚠️  No listings found to process');
      process.exit(0);
    }

    console.log(`📋 Processing ${allListings.length} listings...`);
    console.log('');

    // Download assets (PDFs and images) for each listing
    console.log('📥 Downloading assets to local assets/ folder...');
    console.log('   Structure: assets/{listingId}/pdfs/, assets/{listingId}/images/, assets/{listingId}/metadata.json');
    console.log('');
    
    const assetStats = {
      pdfs: { downloaded: 0, failed: 0, totalSize: 0 },
      images: { downloaded: 0, failed: 0, totalSize: 0 },
      metadata: { saved: 0, failed: 0 },
    };

    // Process each listing to download assets
    let processedCount = 0;
    for (const listing of allListings) {
      processedCount++;
      const listingId = listing._id;
      const listingName = listing.itemName || listing.sku || listingId;
      
      console.log(`\n[${processedCount}/${allListings.length}] Processing: ${listingName} (${listingId})`);

      // Save metadata.json only when crawling from API.
      if (!options.fromMetadata) {
        console.log('  💾 Saving metadata...');
        const metadataResult = await AssetDownloadService.saveMetadata(
          listingId,
          listing
        );
        if (metadataResult.success) {
          assetStats.metadata.saved++;
          console.log('  ✅ Metadata saved');
        } else {
          assetStats.metadata.failed++;
          console.log(`  ⚠️  Failed to save metadata: ${metadataResult.error}`);
        }
      }

      const pdfsToDownload: Array<{ url: string; filename?: string }> = [];
      const imagesToDownload: Array<{ url: string; filename?: string }> = [];

      // Collect PDFs from purchaseLink.digitalEdition (primary source)
      if (listing.purchaseLink?.digitalEdition && typeof listing.purchaseLink.digitalEdition === 'string') {
        const pdfFilename = `${listingName}_digital_edition.pdf`;
        pdfsToDownload.push({
          url: listing.purchaseLink.digitalEdition,
          filename: pdfFilename,
        });
      }

      // Also collect PDFs from freePdfs (fallback/secondary source)
      if (listing.freePdfs && Array.isArray(listing.freePdfs)) {
        for (let i = 0; i < listing.freePdfs.length; i++) {
          const pdf = listing.freePdfs[i];
          // Download PDF file (only if not already added from digitalEdition)
          if (pdf.url && typeof pdf.url === 'string') {
            const pdfFilename = `${listingName}_free_${i + 1}.pdf`;
            pdfsToDownload.push({
              url: pdf.url,
              filename: pdfFilename,
            });
          }

          // Download thumbnail as image
          if (pdf.thumbnail && typeof pdf.thumbnail === 'string') {
            const imageFilename = `${listingName}_free_${i + 1}_thumbnail.png`;
            imagesToDownload.push({
              url: pdf.thumbnail,
              filename: imageFilename,
            });
          }
        }
      }

      // Collect images from images array
      if (listing.images && Array.isArray(listing.images)) {
        for (let i = 0; i < listing.images.length; i++) {
          const img = listing.images[i];
          if (img.url && typeof img.url === 'string') {
            const imageFilename = `${listingName}_image_${i + 1}.png`;
            imagesToDownload.push({
              url: img.url,
              filename: imageFilename,
            });
          }

          // Also collect thumbnail
          if (img.thumbnail && typeof img.thumbnail === 'string') {
            const thumbnailFilename = `${listingName}_image_${i + 1}_thumb.png`;
            imagesToDownload.push({
              url: img.thumbnail,
              filename: thumbnailFilename,
            });
          }
        }
      }

      // Download all assets for this listing
      if (pdfsToDownload.length > 0 || imagesToDownload.length > 0) {
        console.log(`  📥 Downloading ${pdfsToDownload.length} PDFs, ${imagesToDownload.length} images...`);
        
        const listingStats = await AssetDownloadService.downloadListingAssets(
          listingId,
          pdfsToDownload,
          imagesToDownload
        );

        // Aggregate stats
        assetStats.pdfs.downloaded += listingStats.pdfs.downloaded;
        assetStats.pdfs.failed += listingStats.pdfs.failed;
        assetStats.pdfs.totalSize += listingStats.pdfs.totalSize;
        assetStats.images.downloaded += listingStats.images.downloaded;
        assetStats.images.failed += listingStats.images.failed;
        assetStats.images.totalSize += listingStats.images.totalSize;

        console.log(
          `  ✅ Downloaded: ${listingStats.pdfs.downloaded} PDFs, ${listingStats.images.downloaded} images`
        );
        if (listingStats.pdfs.failed > 0 || listingStats.images.failed > 0) {
          console.log(
            `  ⚠️  Failed: ${listingStats.pdfs.failed} PDFs, ${listingStats.images.failed} images`
          );
        }
      } else {
        console.log('  ℹ️  No assets to download');
      }
    }

    console.log('\n📊 Asset Download Summary:');
    console.log(`  PDFs: ${assetStats.pdfs.downloaded} downloaded, ${assetStats.pdfs.failed} failed, ${(assetStats.pdfs.totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Images: ${assetStats.images.downloaded} downloaded, ${assetStats.images.failed} failed, ${(assetStats.images.totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Metadata: ${assetStats.metadata.saved} saved, ${assetStats.metadata.failed} failed`);
    console.log('');

    console.log('\n✅ Crawler completed successfully!');
    console.log('\n📈 Final Statistics:');
    if (!options.fromMetadata) {
      console.log(`  Pages fetched: ${currentPage - startPage}`);
      if (totalPages) {
        console.log(`  Total pages available: ${totalPages}`);
      }
    }
    console.log(`  Listings processed: ${allListings.length}`);
    if (!options.fromMetadata) {
      console.log(`  Metadata saved: ${assetStats.metadata.saved} files`);
    }
    console.log(`  Assets downloaded: ${assetStats.pdfs.downloaded + assetStats.images.downloaded} files`);
    console.log(`  Assets failed: ${assetStats.pdfs.failed + assetStats.images.failed} files`);
    console.log(`  Total size: ${((assetStats.pdfs.totalSize + assetStats.images.totalSize) / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`\n📁 All files saved to:`);
    console.log(`   - assets/{listingId}/metadata.json (API response data)`);
    console.log(`   - assets/{listingId}/pdfs/ (PDF files)`);
    console.log(`   - assets/{listingId}/images/ (Image files)`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error in crawler:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run crawler when script is executed
// This will run when the script is executed directly with tsx or node
const options = parseArgs();
crawl(options).catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

export { crawl };
