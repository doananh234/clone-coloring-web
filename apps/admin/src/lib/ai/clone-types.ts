// Types reused from extraction-review-modal.tsx pattern
export type ExtractedCharacter = {
  name: string;
  type: string;
  role: string;
  visualDna: Record<string, unknown>;
  characterPrompt: string;
  tags: string[];
};

export type ExtractedLocation = {
  name: string;
  description: string;
  visualDescription: string;
  locationPrompt: string;
  atmosphere: Record<string, string>;
  props: string[];
  tags: string[];
};

export type ClonePageProp = {
  name: string;
  position: string;
  interaction: string;
};

export type ClonePageRawData = {
  scene: {
    description: string;
    cameraView: string;
    composition: string;
  };
  environment: {
    timeOfDay: string;
    weather: string;
    season: string;
    mood: string;
  };
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
  props: ClonePageProp[];
  reproductionPrompt: string;
};

export type CloneJobPage = {
  pageNumber: number;
  imageUrl: string;
  status: "pending" | "analyzing" | "analyzed" | "error";
  rawData?: ClonePageRawData;
  error?: string;
};

export type CloneJobBookData = {
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  categoryId?: string;
  ageRange?: string;
  artStyleId?: string;
};

export type CloneJob = {
  id: string;
  name: string;
  status: "uploading" | "extracted" | "analyzing" | "analyzed" | "confirmed" | "error";
  sourceFileName: string;
  sourcePdfUrl: string;
  totalPages: number;
  analyzedPages: number;
  pages: CloneJobPage[];
  bookData?: CloneJobBookData;
  resultBookId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
