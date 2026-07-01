/**
 * Prompt template for AI-powered book metadata generation.
 * Used with visionAnalyzeJSON() to analyze a coloring book thumbnail
 * and generate metadata fields + Etsy listing content.
 */

export type BookMetaGenerationResult = {
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  backgroundColor: string;
  categoryId: string;
  category: string;
  price: string;
  ageRange: string;
  dimensions: string;
  tags: string[];
  primaryColor: string;
  secondaryColor: string;
  themeStyle: string;
  holiday: string;
  occasion: string;
  etsyListing: {
    etsyTitle: string;
    etsyDescription: string;
    materials: string[];
    etsyCategory: string;
    subcategory: string;
    priceSuggestionUsd: number;
    priceNotes: string;
    section: string;
    generatedAt: string;
  };
};

export type CategoryOption = { id: string; displayName: string };

export function buildBookMetaPrompt(categories?: CategoryOption[]): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert Etsy seller and coloring book marketing specialist. You analyze coloring book cover/thumbnail images and generate optimized metadata for product listings.

Rules:
- Analyze the visual content, art style, colors, characters, scenes, and mood
- Generate metadata that is specific to what you SEE in the image — no generic filler
- For Etsy content, write like a real human shop owner, not an AI
- Use natural contractions (I'm, don't, it's, we've, that's)
- Vary paragraph length in descriptions
- Reference specific visual details from the thumbnail

FORBIDDEN phrases (never use these):
- "Welcome to our shop" / "Welcome to my shop"
- "We are passionate about" / "I am passionate about"
- "Unleash your creativity"
- "Perfect for"
- "Dive into"
- "Whether you're a..."
- "In today's..."
- "Look no further"
- "Transform your" / "Elevate your" / "Take your"
- "Ready to"
- "Don't miss out" / "Act now"
- "Limited time"

Return ONLY valid JSON matching the exact schema provided.`;

  const userPrompt = `Analyze this coloring book cover image and generate all metadata fields.

Return a JSON object with this exact structure:
{
  "title": "catchy book title (under 60 chars, include 'Coloring Book')",
  "subtitle": "short subtitle (under 40 chars, describes the theme/audience)",
  "description": "compelling 2-3 sentence book description highlighting what makes this book special and who it's for",
  "badge": "NEW" or "HOT" or "SALE" or "" (pick based on visual appeal — use "" if unsure),${
    categories && categories.length > 0
      ? `\n  "categoryId": "pick the best matching category ID from this list: ${categories.map((c) => `${c.id} (${c.displayName})`).join(", ")}",\n  "category": "the displayName of the matched category",`
      : `\n  "categoryId": "",\n  "category": "suggested category name",`
  }
  "price": "suggested retail price as string (e.g. '7.99') — between 5.99 and 14.99 based on perceived detail level and page count",
  "ageRange": "target age range (e.g. 'Adults', '6-12', '3-5', 'All Ages')",
  "dimensions": "standard print dimensions (e.g. '8.5 x 11 inches')",
  "backgroundColor": "hex color code extracted from the dominant background of the cover (e.g. #F5E6D3)",
  "tags": ["exactly 13 search keywords — mix broad terms like 'coloring book' with long-tail like 'woodland animal coloring pages for adults'"],
  "primaryColor": "dominant color name (e.g. Black, Blue, Pink, Multicolor)",
  "secondaryColor": "secondary color name or None",
  "themeStyle": "art style (e.g. Kawaii, Minimalist, Detailed, Cartoon, Realistic, Whimsical, Mandala, Zentangle)",
  "holiday": "relevant holiday if applicable (Christmas, Halloween, Easter, Valentine's Day) or None",
  "occasion": "relevant occasion (Birthday, Back to School, Rainy Day Activity, Gift, Relaxation) or None",
  "etsyListing": {
    "etsyTitle": "SEO-optimized Etsy title (max 140 chars, include primary keyword + 'Coloring Book' + differentiator)",
    "etsyDescription": "800-1500 word Etsy product description. Structure: opening hook (2-3 sentences about what makes this book special), what's inside (page count themes, art style), who it's for (age range, skill level), file details (Digital PDF, 8.5x11 inches, 300dpi), printing tips (use cardstock, inkjet recommended), a casual closing. Write conversationally — like texting a friend who asked about your book. NO emoji. Max 1 exclamation mark per paragraph.",
    "materials": ["Digital PDF", "Printable", "Instant Download"],
    "etsyCategory": "Etsy category path (e.g. Art & Collectibles > Drawing & Illustration > Digital)",
    "subcategory": "specific subcategory (e.g. Coloring Pages, Printable Art)",
    "priceSuggestionUsd": 5.99,
    "priceNotes": "1-2 sentence rationale for the price based on page count, detail level, uniqueness",
    "section": "suggested shop section name (e.g. Animal Coloring Books, Mandala Collection)",
    "generatedAt": "${new Date().toISOString()}"
  }
}

Be specific to what you see in the image. Extract real colors, identify actual characters/scenes, and match the art style accurately.`;

  return { systemPrompt, userPrompt };
}
