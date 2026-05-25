import { useCallback } from "react";
import type { AppHomeNewArrivalBook, AppHomeTrendingBook, AppHomeCategory } from "./app-home-types";

type SetState<T> = React.Dispatch<React.SetStateAction<T[]>>;

/**
 * Creates memoized handlers for the three ItemPickerDialog confirm callbacks.
 * Extracts relevant fields from the raw Firestore docs and appends new picks.
 */
export function usePickerHandlers(
  newArrivals: AppHomeNewArrivalBook[],
  trending: AppHomeTrendingBook[],
  categories: AppHomeCategory[],
  allBooks: Record<string, unknown>[],
  allCategories: Record<string, unknown>[],
  setNewArrivals: SetState<AppHomeNewArrivalBook>,
  setTrending: SetState<AppHomeTrendingBook>,
  setCategories: SetState<AppHomeCategory>,
) {
  const handleNewArrivalPick = useCallback(
    (ids: string[]) => {
      const existing = new Set(newArrivals.map((b) => b.id));
      const toAdd = ids
        .filter((id) => !existing.has(id))
        .map((id) => {
          const book = allBooks.find((b) => b.id === id);
          return {
            id,
            title: (book?.title as string) ?? "",
            coverUrl: (book?.coverUrl as string) ?? "",
            price: (book?.price as string) ?? "",
          } satisfies AppHomeNewArrivalBook;
        });
      setNewArrivals((prev) => [...prev, ...toAdd]);
    },
    [newArrivals, allBooks, setNewArrivals],
  );

  const handleTrendingPick = useCallback(
    (ids: string[]) => {
      const existing = new Set(trending.map((b) => b.id));
      const toAdd = ids
        .filter((id) => !existing.has(id))
        .map((id) => {
          const book = allBooks.find((b) => b.id === id);
          return {
            id,
            rank: trending.length + 1,
            title: (book?.title as string) ?? "",
            subtitle: (book?.subtitle as string) ?? "",
            imageUrl: (book?.coverUrl as string) ?? "",
          } satisfies AppHomeTrendingBook;
        });
      setTrending((prev) => [...prev, ...toAdd]);
    },
    [trending, allBooks, setTrending],
  );

  const handleCategoryPick = useCallback(
    (ids: string[]) => {
      const existing = new Set(categories.map((c) => c.id));
      const toAdd = ids
        .filter((id) => !existing.has(id))
        .map((id) => {
          const cat = allCategories.find((c) => c.id === id);
          return {
            id,
            name: (cat?.name as string) ?? "",
            displayName: (cat?.displayName as string) ?? "",
            description: (cat?.description as string) ?? "",
            iconUrl: (cat?.iconUrl as string) ?? "",
            isPublic: (cat?.isPublic as boolean) ?? true,
            order: categories.length,
          } satisfies AppHomeCategory;
        });
      setCategories((prev) => [...prev, ...toAdd]);
    },
    [categories, allCategories, setCategories],
  );

  return { handleNewArrivalPick, handleTrendingPick, handleCategoryPick };
}
