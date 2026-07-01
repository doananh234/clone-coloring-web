# Crawler Script - Local Asset Downloader

Standalone script to crawl listings and download assets **locally** to the `assets/` folder.

**No Firebase/Google Cloud authentication required** - this is a pure local file downloader.

## Prerequisites

Install dependencies:
```bash
yarn install
```

The script requires `tsx` to run TypeScript files directly. It should be installed as a dev dependency.

## Usage

### Basic Usage

Run the crawler with default settings:
```bash
yarn crawl
```

Or directly with tsx:
```bash
yarn tsx scripts/crawl.ts
```

### Download-only mode (no API calls)

If you already have `assets/{listingId}/metadata.json` and your asset URLs are public, you can skip the listings API entirely:

```bash
yarn crawl --from-metadata
```

### Options

```bash
yarn crawl [options]
```

Available options:

- `--from-metadata` - Read `assets/*/metadata.json` and download from those public URLs only (no API calls)
- `--assets-dir <path>` - Override assets directory (default: `./assets`) (also controls where files are written)
- `--max-listings <number>` - Limit number of listings processed in `--from-metadata` mode
- `--api-url, -u <url>` - Override default API URL
- `--authorization, -a <token>` - Override authorization header
- `--api-key, -k <key>` - Override x-api-key header
- `--limit, -l <number>` - Limit per page (default: 50)
- `--max-pages, -p <number>` - Maximum pages to fetch (default: all pages)
- `--page <number>` - Start from specific page (default: 1)
- `--help, -h` - Show help message

**Note:** By default, the crawler fetches ALL pages automatically. Use `--max-pages` to limit the number of pages.

### Examples

**Fetch all pages (default behavior):**
```bash
yarn crawl
```

**Download only from existing metadata (no API calls):**
```bash
yarn crawl --from-metadata
```

**Fetch all pages with custom limit per page:**
```bash
yarn crawl --limit 100
```

**Fetch only first 5 pages:**
```bash
yarn crawl --max-pages 5
```

**Start from page 2:**
```bash
yarn crawl --page 2
```

**Fetch first 3 pages with 50 listings per page:**
```bash
yarn crawl --max-pages 3 --limit 50
```

**Crawl with custom API URL:**
```bash
yarn crawl --api-url "https://api.example.com/listings" --limit 20
```

**Crawl with custom authorization:**
```bash
yarn crawl --authorization "Bearer YOUR_TOKEN" --limit 50
```

## What It Does

1. **Fetches listings** from the external API (with pagination support)
2. **Saves metadata** to `assets/{listingId}/metadata.json` (full API response data)
3. **Downloads PDFs** to `assets/{listingId}/pdfs/`
4. **Downloads images** to `assets/{listingId}/images/`

With `--from-metadata`, step (1) and (2) are skipped: the script reads local `metadata.json` files and downloads directly from the public URLs inside.

**Note:** This script does NOT save data to Firebase/Firestore. It only downloads files locally.

## Output

The script provides detailed progress output:
- Number of listings fetched
- Listing save statistics (created/updated)
- Asset download progress per listing
- Final statistics summary

## Error Handling

The script will exit with code 1 if any critical errors occur. Non-critical errors (like failed downloads) are logged but don't stop the process.

## Output Location

All downloaded files are saved to:
```
assets/
  {listing_id_1}/
    metadata.json          # Full API response data (JSON)
    pdfs/
      file1.pdf
      file2.pdf
    images/
      thumbnail1.png
      image1.png
      image2.jpg
  {listing_id_2}/
    metadata.json
    pdfs/
      ...
    images/
      ...
```

### Metadata File

The `metadata.json` file contains the complete API response data for each listing, including:
- All listing fields (itemName, sku, description, etc.)
- freePdfs array with URLs
- images array with URLs
- Tags, categories, and other metadata
- User and store information

This allows you to process the data later without needing to re-fetch from the API.

## No Authentication Required

This script does NOT require:
- Firebase service account credentials
- Google Cloud authentication
- Firestore connection
- Any cloud services

It's a pure local file downloader that only needs network access to fetch listings and download assets.
