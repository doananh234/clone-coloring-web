/** One recorded retry attempt (from CloneJob.data.retryHistory[]). */
export interface CloneRetryRecord {
  step: string;
  attempt: number;
  error: string;
  at: string;
}

/** Shape returned by GET /api/clone (see apps/admin/src/app/api/clone/route.ts). */
export interface CloneJobRow {
  id: string;
  name: string;
  status: string;
  totalPages: number;
  analyzedPages: number;
  bookId: string | null;
  sourceBookId: string | null;
  currentStep: string | null;
  failedStep: string | null;
  /** Failure reason message (from CloneJob.error). Null unless the job errored. */
  error: string | null;
  retryHistory: CloneRetryRecord[];
  thumbnailUrl: string | null;
  brand: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloneJobsResponse {
  success: boolean;
  data: CloneJobRow[];
  counts: Record<string, number>;
}

export interface CloneJobPage {
  pageNumber: number;
  imageUrl: string;
  status: string;
  /** D2 classification fields (set during gate review). */
  pageType?: "cover" | "interiorIntro" | "interior";
  excluded?: boolean;
  /** D3 lineage fields (set by stepFillInterior / fill route). */
  origin?: "original" | "additional";
  parentPageNumber?: number;
  /** Real API field for the redesigned/reproduced result. */
  reproducedUrl?: string;
  redesignedUrl?: string;
  /** Candidate slots (present only on jobs that ran the regen/angle flow). */
  redesignCandidateUrl?: string;
  angleCandidateUrl?: string;
  angleCandidateView?: string;
  regenCandidateUrl?: string;
  /** Per-page analyze data (present only if the job stored it). */
  rawData?: {
    /** Older jobs store a plain string; newer store {cameraView, composition, description}. */
    scene?: { cameraView?: string; composition?: string; description?: string } | string;
    environment?: string;
    characters?: { name?: string }[];
    locations?: { name?: string }[];
    props?: unknown[];
    reproductionPrompt?: string;
  };
}

export interface CloneEntityRef {
  id?: string;
  name: string;
}

/** Shape returned by GET /api/clone/[jobId] → { success, job } (URLs already R2-resolved). */
export interface CloneJobDetail {
  id: string;
  name: string;
  status: string;
  totalPages: number;
  analyzedPages: number;
  sourceFileName?: string;
  sourcePdfUrl?: string;
  brand?: string | null;
  currentStep?: string | null;
  error?: string;
  /** Which pipeline step failed (from CloneJob.data.failedStep). */
  failedStep?: string | null;
  /** All retry attempts recorded before the final failure. */
  retryHistory?: CloneRetryRecord[];
  bookId?: string | null;
  resultBookId?: string | null;
  pages: CloneJobPage[];
  entityMap?: { characters?: CloneEntityRef[]; locations?: CloneEntityRef[] };
  createdAt?: string;
  updatedAt?: string;
}

export interface CloneJobResponse {
  success: boolean;
  job: CloneJobDetail;
}

export interface EtsyListingInfo {
  etsyTitle?: string;
  priceSuggestionUsd?: number;
}

/** Shape returned by GET /api/books (subset we render). */
export interface BookRow {
  id: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  thumbnailUrl?: string | null;
  squareThumbnailUrl?: string | null;
  category?: string | null;
  /** Denormalized source niche (from CloneJob → SourceBook), shown as a tag. */
  niche?: string | null;
  /** Operator id this book is assigned to (null = unassigned). */
  assignedToId?: string | null;
  /** Kanban queue status: "todo" | "in_progress" | "review" | "done". */
  queueStatus?: string | null;
  price?: string | null;
  isPublic?: boolean;
  isPremium?: boolean;
  etsyListing?: EtsyListingInfo | null;
  createdAt?: string;
  specifications?: { pages?: number } | null;
}

/** Generic entity list item (characters, locations, art/coloring styles). */
export interface EntityListItem {
  id: string;
  name: string;
  displayName?: string | null;
  email?: string | null;
  description?: string | null;
  type?: string | null;
  role?: string | null;
  thumbnailUrl?: string | null;
  logoUrl?: string | null;
  referenceImageUrl?: string | null;
  referenceImages?: string[] | null;
  isPublic?: boolean;
  tags?: string[];
  /** Coloring-style color variants (opaque here; shape in @vx/clone-core). */
  variants?: unknown;
  /** Raw JSON blob (list API returns all columns). `data.source` = "manual" |
   *  "clone" marks how a coloring style was created (used by the list tabs). */
  data?: Record<string, unknown> | null;
}

export interface EntityListResponse<T = EntityListItem> {
  data: T[];
  meta?: { total?: number };
}

/** D4b: a non-destructive regenerated version of an interior page. */
export interface PageVariant {
  id: string;
  url: string;
  coloredUrl?: string;
  origin: "original" | "regen";
  source?: "A" | "B";
  prompt?: string;
  changePercent?: number;
  createdAt: string;
}

/** D4c: a non-destructive cover candidate. Lives in book.data.coverCandidates[];
 *  book.data.selectedCoverCandidateId points at the live one and book.coverUrl mirrors its url. */
export interface CoverCandidate {
  id: string;
  url: string;
  origin: "source" | "pushed";
  fromPageId?: string;
  createdAt: string;
}

export interface BookColoringPage {
  id: string;
  url: string;
  isPublic?: boolean;
  coloredUrl?: string;
  coloringStyleId?: string;
  /** Reproduction/redesign prompt copied from the source clone job. */
  prompt?: string;
  /**
   * Structured analyze data copied from the source clone job at create-book time.
   * NOTE: some legacy books stored this malformed (a JSON string spread into an
   * object → numeric keys); use `parsePageScene()` to read it safely.
   */
  sceneData?: PageSceneData | Record<string, unknown> | string | null;
  /** D4a lineage carried from the clone JobPage (for the book's Number/Background badges). */
  sourcePageNumber?: number;
  origin?: "original" | "additional";
  parentPageNumber?: number;
  /** D4b: non-destructive regen variants; selectedVariantId is the live pointer
   *  and url/coloredUrl mirror the selected variant. undefined = never regenerated. */
  variants?: PageVariant[];
  selectedVariantId?: string;
}

export interface PageSceneData {
  scene?: { cameraView?: string; composition?: string; description?: string } | string | null;
  environment?: { mood?: string } | string | null;
  characters?: { name?: string }[];
  locations?: { name?: string }[];
}

/** Full book from GET /api/books/[bookId] (raw object, subset we render). */
export interface BookDetail extends BookRow {
  description?: string | null;
  pdfUrl?: string | null;
  originalPrice?: string | null;
  discount?: string | null;
  badge?: string | null;
  updatedAt?: string;
  tags?: string[];
  coloringPages?: BookColoringPage[];
  summaryPages?: { id: string; url: string; isPublic?: boolean; sourcePageNumber?: number }[];
  specifications?: { pages?: number; dimensions?: string; ageRange?: string } | null;
  /** Raw JSON blob; coverMeta.sourceThumbnailUrl = clean illustration (no text). */
  data?: Record<string, unknown> | null;
}
