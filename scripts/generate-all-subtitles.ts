/**
 * Script: generate-all-subtitles.ts
 *
 * Fetches all books from the running dashboard API, generates a subtitle
 * for each book that doesn't already have one, and saves it back.
 *
 * Usage:
 *   npx tsx scripts/generate-all-subtitles.ts
 *   npx tsx scripts/generate-all-subtitles.ts --force        # regenerate even if subtitle exists
 *   npx tsx scripts/generate-all-subtitles.ts --dry-run      # preview without saving
 *   BASE_URL=https://example.com npx tsx scripts/generate-all-subtitles.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 1500; // delay between requests to avoid rate-limiting

interface Book {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllBooks(): Promise<Book[]> {
  const res = await fetch(`${BASE_URL}/api/books`);
  if (!res.ok) throw new Error(`Failed to fetch books: ${res.status} ${res.statusText}`);
  return res.json();
}

async function generateSubtitle(book: Book): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/books/${book.id}/generate-subtitle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: book.title, description: book.description }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Generate failed: ${res.status} — ${(err as any).error || res.statusText}`);
  }
  const data = await res.json();
  return data.subtitle;
}

async function saveSubtitle(bookId: string, subtitle: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/books/${bookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtitle }),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status} ${res.statusText}`);
}

async function main() {
  console.log(`\n🎨 Generate Subtitles for All Books`);
  console.log(`   Base URL : ${BASE_URL}`);
  console.log(`   Force    : ${FORCE}`);
  console.log(`   Dry Run  : ${DRY_RUN}\n`);

  const books = await fetchAllBooks();
  console.log(`Found ${books.length} books.\n`);

  const toProcess = FORCE ? books : books.filter((b) => !b.subtitle);

  if (toProcess.length === 0) {
    console.log('All books already have subtitles. Use --force to regenerate.');
    return;
  }

  console.log(`Processing ${toProcess.length} book(s)...\n`);

  let success = 0;
  let failed = 0;

  for (const book of toProcess) {
    const label = `[${book.id}] "${book.title}"`;
    try {
      const subtitle = await generateSubtitle(book);
      console.log(`✅ ${label} → "${subtitle}"`);

      if (!DRY_RUN) {
        await saveSubtitle(book.id, subtitle);
      } else {
        console.log(`   (dry-run, not saved)`);
      }
      success++;
    } catch (err) {
      console.error(`❌ ${label} — ${(err as Error).message}`);
      failed++;
    }

    // delay between requests
    if (toProcess.indexOf(book) < toProcess.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone! ✅ ${success} succeeded, ❌ ${failed} failed.\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
