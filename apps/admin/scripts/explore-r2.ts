import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  // List top-level prefixes (book IDs)
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET!,
      Prefix: "assets/",
      Delimiter: "/",
    }),
  );

  console.log("=== TOP-LEVEL PREFIXES (Book IDs) ===");
  const prefixes = result.CommonPrefixes?.map((p) => p.Prefix!) || [];
  console.log(`Found ${prefixes.length} book folders`);

  // For each book folder, list contents and check for PDFs
  const booksWithPdf: string[] = [];
  const booksWithoutPdf: string[] = [];

  for (const prefix of prefixes) {
    const bookId = prefix.replace("assets/", "").replace("/", "");

    const contents = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET!,
        Prefix: prefix,
        MaxKeys: 1000,
      }),
    );

    const files = contents.Contents?.map((c) => c.Key!) || [];
    const hasPdf = files.some((f) => f.endsWith(".pdf"));
    const pdfFiles = files.filter((f) => f.endsWith(".pdf"));
    const imageFiles = files.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

    if (hasPdf) {
      booksWithPdf.push(bookId);
      console.log(`\n✅ ${bookId} — ${imageFiles.length} images, ${pdfFiles.length} PDFs`);
      pdfFiles.forEach((f) => console.log(`   PDF: ${f}`));
    } else {
      booksWithoutPdf.push(bookId);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Books WITH PDF: ${booksWithPdf.length}`);
  console.log(`Books WITHOUT PDF: ${booksWithoutPdf.length}`);
  console.log(`\n=== BOOKS WITH PDF (IDs) ===`);
  booksWithPdf.forEach((id) => console.log(id));
  console.log(`\n=== BOOKS WITHOUT PDF (IDs) ===`);
  booksWithoutPdf.forEach((id) => console.log(id));
}

main().catch(console.error);
