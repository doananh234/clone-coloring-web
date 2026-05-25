import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

// --- R2 Setup ---
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const R2_BUCKET = process.env.R2_BUCKET!;
const R2_PUBLIC_BASE_URL = (
  process.env.R2_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
  ""
).replace(/\/$/, "");

// --- Firebase Admin Setup ---
function findServiceAccount() {
  const candidates = [
    path.resolve(process.cwd(), "service-account.development.json"),
    path.resolve(process.cwd(), "../..", "service-account.development.json"),
    path.resolve(process.cwd(), "../../..", "petpa-dashboard/service-account.development.json"),
    path.resolve(process.cwd(), "service-account.production.json"),
    path.resolve(process.cwd(), "../..", "service-account.production.json"),
    path.resolve(process.cwd(), "../../..", "petpa-dashboard/service-account.production.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  }
  throw new Error("No service account found. Checked: " + candidates.join(", "));
}

const sa = findServiceAccount();
const app = initializeApp({
  credential: cert(sa),
  projectId: sa.project_id,
});
const db = getFirestore(app);

async function main() {
  console.log("=== Step 1: List R2 book IDs ===");

  const r2BookIds = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const result = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: "assets/",
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const p of result.CommonPrefixes || []) {
      const id = p.Prefix!.replace("assets/", "").replace("/", "");
      if (id) r2BookIds.add(id);
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  console.log(`Found ${r2BookIds.size} books in R2`);

  console.log("\n=== Step 2: List Firestore books ===");

  const booksSnap = await db.collection("books").get();
  const firestoreBooks = booksSnap.docs.map((doc) => ({
    id: doc.id,
    title: doc.data().title || "(no title)",
    pdfUrl: doc.data().pdfUrl || null,
    coverUrl: doc.data().coverUrl || null,
  }));

  console.log(`Found ${firestoreBooks.length} books in Firestore`);

  // Categorize
  const booksInR2: typeof firestoreBooks = [];
  const booksNotInR2: typeof firestoreBooks = [];

  for (const book of firestoreBooks) {
    if (r2BookIds.has(book.id)) {
      booksInR2.push(book);
    } else {
      booksNotInR2.push(book);
    }
  }

  console.log(`\nBooks in both Firestore AND R2: ${booksInR2.length}`);
  console.log(`Books in Firestore but NOT in R2: ${booksNotInR2.length}`);

  console.log("\n=== Step 3: Update pdfUrl for books in R2 ===");

  let updated = 0;
  for (const book of booksInR2) {
    const expectedPdfUrl = `assets/${book.id}/redesign/redesign-edition.pdf`;
    if (book.pdfUrl !== expectedPdfUrl) {
      await db.collection("books").doc(book.id).update({
        pdfUrl: expectedPdfUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated++;
      console.log(`  ✅ Updated pdfUrl for "${book.title}" (${book.id})`);
    }
  }
  console.log(`Updated ${updated} books with pdfUrl`);

  console.log("\n=== Step 4: Delete books NOT in R2 ===");

  if (booksNotInR2.length === 0) {
    console.log("No books to delete.");
  } else {
    console.log(`Deleting ${booksNotInR2.length} books not in R2:`);
    for (const book of booksNotInR2) {
      console.log(`  🗑 Deleting "${book.title}" (${book.id})`);
      await db.collection("books").doc(book.id).delete();
    }
    console.log(`Deleted ${booksNotInR2.length} books`);
  }

  console.log("\n=== DONE ===");
  console.log(`Summary:`);
  console.log(`  - R2 books: ${r2BookIds.size}`);
  console.log(`  - Firestore books (before): ${firestoreBooks.length}`);
  console.log(`  - Updated pdfUrl: ${updated}`);
  console.log(`  - Deleted (not in R2): ${booksNotInR2.length}`);
  console.log(`  - Firestore books (after): ${booksInR2.length}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
