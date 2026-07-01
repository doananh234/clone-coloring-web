import { db } from '../src/lib/firebase-admin';
async function main() {
  const bookId = '68ee0c8cc4369d7d4931870f';
  const book = await db.collection('books').doc(bookId).get();
  const data = book.data() || {};
  console.log('BOOK:', bookId);
  console.log('  coverUrl:', data.coverUrl);
  console.log('  coloringPages:', (data.coloringPages||[]).length, '→ first url:', data.coloringPages?.[0]?.url?.substring(0, 80));
  console.log('  isEditionConverted:', data.isEditionConverted);
  console.log('  categoryId:', data.categoryId);

  const listing = await db.collection('listings').doc(bookId).get();
  if (listing.exists) {
    const ld = listing.data()?.listingData || {};
    const imgs = ld.images || [];
    console.log('\nLISTING:', bookId);
    console.log('  images:', imgs.length);
    console.log('  first url:', imgs[0]?.url?.substring(0, 80));
    console.log('  first thumbnail:', imgs[0]?.thumbnail?.substring(0, 80));
    console.log('  isRedesign:', imgs[0]?.isRedesign);
    console.log('  redesignThumbnailUrl:', ld.redesignThumbnailUrl);
  } else {
    console.log('\nNo listing found for', bookId);
  }
}
main();
