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
  /** URL of the redesigned version (image-to-image from original + prompt) */
  redesignedUrl?: string;
  /** Prompt used for redesign */
  redesignPrompt?: string;
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

export type CloneEntityRef = {
  id: string;
  name: string;
  referenceImageUrl: string;
};

export type CloneEntityMap = {
  characters: CloneEntityRef[];
  locations: CloneEntityRef[];
};

export type CloneJob = {
  id: string;
  name: string;
  status:
    | "uploading"
    | "extracted"
    | "analyzing"
    | "analyzed"
    | "confirmed"
    | "entities_ready"
    | "reproduced"
    | "error";
  sourceFileName: string;
  sourcePdfUrl: string;
  totalPages: number;
  analyzedPages: number;
  pages: CloneJobPage[];
  bookData?: CloneJobBookData;
  entityMap?: CloneEntityMap;
  bookId?: string;
  resultBookId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
