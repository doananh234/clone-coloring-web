import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ASSET_DIR = process.argv[2];

if (!ASSET_DIR) {
  console.error('Usage: tsx scripts/pdf-to-images.ts <asset-directory>');
  console.error('Example: tsx scripts/pdf-to-images.ts assets/68ee0c8cc4369d7d493187a3');
  process.exit(1);
}

const absoluteAssetDir = path.isAbsolute(ASSET_DIR)
  ? ASSET_DIR
  : path.join(process.cwd(), ASSET_DIR);

const pdfDir = path.join(absoluteAssetDir, 'pdfs');
const outputDir = path.join(absoluteAssetDir, 'pdf-pages');

async function convertPdfToImages() {
  // Check if PDF directory exists
  if (!fs.existsSync(pdfDir)) {
    console.error(`PDF directory not found: ${pdfDir}`);
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Get all PDF files
  const pdfFiles = fs.readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (pdfFiles.length === 0) {
    console.log('No PDF files found in', pdfDir);
    return;
  }

  console.log(`Found ${pdfFiles.length} PDF file(s)`);

  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(pdfDir, pdfFile);
    const baseName = path.basename(pdfFile, '.pdf');
    const pdfOutputDir = path.join(outputDir, baseName);

    // Create directory for this PDF's pages
    if (!fs.existsSync(pdfOutputDir)) {
      fs.mkdirSync(pdfOutputDir, { recursive: true });
    }

    console.log(`\nConverting: ${pdfFile}`);
    console.log(`Output directory: ${pdfOutputDir}`);

    try {
      // Use ImageMagick to convert PDF to images
      // -density 300 sets DPI for quality
      // -quality 100 for best quality
      const outputPattern = path.join(pdfOutputDir, 'page-%03d.png');

      const command = `magick -density 300 "${pdfPath}" -quality 100 "${outputPattern}"`;

      console.log(`Running: ${command}`);
      execSync(command, { stdio: 'inherit' });

      // Count generated files
      const generatedFiles = fs.readdirSync(pdfOutputDir).filter((f) => f.endsWith('.png'));
      console.log(`Generated ${generatedFiles.length} page(s) for ${pdfFile}`);
    } catch (error) {
      console.error(`Error converting ${pdfFile}:`, error);
    }
  }

  console.log('\nConversion complete!');
  console.log(`Output directory: ${outputDir}`);
}

convertPdfToImages();
