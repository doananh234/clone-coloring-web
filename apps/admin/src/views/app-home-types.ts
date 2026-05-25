/** Types matching the Firestore `app/home` document schema. */

export type AppHomeNewArrivalBook = {
  id: string;
  title: string;
  coverUrl: string;
  price?: string;
  subtitle?: string;
  order?: number;
};

export type AppHomeTrendingBook = {
  id: string;
  rank: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  participantCount?: string;
};

export type AppHomeCategory = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  iconUrl: string;
  isPublic: boolean;
  order: number;
};

export type AppHomeDocument = {
  newArrivalBooks: AppHomeNewArrivalBook[];
  trendingBooks: AppHomeTrendingBook[];
  categories: AppHomeCategory[];
  updatedAt?: unknown;
};
