import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useFirestore } from "@vx/core-uikit/firebase";
import { useFirestoreGetAll, normalizeTimestamps } from "@vx/core-uikit/firebase";
import { SortableList, ItemPickerDialog, Button, Badge } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash, faFloppyDisk, faRotate } from "@fortawesome/pro-regular-svg-icons";
import { CollapsibleSection } from "./collapsible-section";
import { usePickerHandlers } from "./app-home-picker-handlers";
import type {
  AppHomeDocument,
  AppHomeNewArrivalBook,
  AppHomeTrendingBook,
  AppHomeCategory,
} from "./app-home-types";

export { AppHomeConfigPage };

// ---------------------------------------------------------------------------
// Hook: load the singleton app/home document
// ---------------------------------------------------------------------------

function useAppHomeDoc(firestore: ReturnType<typeof useFirestore>) {
  return useQuery({
    queryKey: ["app-home", "firestore-detail", "app", "home"],
    queryFn: async () => {
      const snap = await getDoc(doc(firestore, "app", "home"));
      if (!snap.exists()) return null;
      return normalizeTimestamps(snap.data()) as AppHomeDocument;
    },
  });
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

function AppHomeConfigPage() {
  const { t } = useTranslation("appHome");
  const { t: tc } = useTranslation("common");
  const firestore = useFirestore();
  const queryClient = useQueryClient();

  const { data: homeDoc, isLoading } = useAppHomeDoc(firestore);

  const { data: allBooks, isLoading: booksLoading } = useFirestoreGetAll<Record<string, unknown>>({
    entityName: "books",
    collectionPath: "books",
    orderByField: "title",
    pageSize: 500,
  });
  const { data: allCategories, isLoading: catsLoading } = useFirestoreGetAll<
    Record<string, unknown>
  >({
    entityName: "categories",
    collectionPath: "categories",
    orderByField: "index",
    pageSize: 500,
  });

  // Local state
  const [newArrivals, setNewArrivals] = useState<AppHomeNewArrivalBook[]>([]);
  const [trending, setTrending] = useState<AppHomeTrendingBook[]>([]);
  const [categories, setCategories] = useState<AppHomeCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<"newArrival" | "trending" | "category" | null>(null);

  // Populate from loaded doc
  useEffect(() => {
    if (homeDoc) {
      setNewArrivals(homeDoc.newArrivalBooks ?? []);
      setTrending(homeDoc.trendingBooks ?? []);
      setCategories(homeDoc.categories ?? []);
    }
  }, [homeDoc]);

  // Picker confirm handlers (extracted for modularity)
  const { handleNewArrivalPick, handleTrendingPick, handleCategoryPick } = usePickerHandlers(
    newArrivals,
    trending,
    categories,
    allBooks,
    allCategories,
    setNewArrivals,
    setTrending,
    setCategories,
  );

  // Save entire document
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      await setDoc(doc(firestore, "app", "home"), {
        newArrivalBooks: newArrivals.map((b, i) => ({ ...b, order: i })),
        trendingBooks: trending.map((b, i) => ({ ...b, rank: i + 1 })),
        categories: categories.map((c, i) => ({ ...c, order: i })),
        updatedAt: serverTimestamp(),
      });
      await queryClient.invalidateQueries({ queryKey: ["app-home"] });
      notify.success(tc("saved"));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }, [newArrivals, trending, categories, firestore, queryClient, tc]);

  // Remove helpers
  const removeNewArrival = (id: string) => setNewArrivals((p) => p.filter((b) => b.id !== id));
  const removeTrending = (id: string) => setTrending((p) => p.filter((b) => b.id !== id));
  const removeCategory = (id: string) => setCategories((p) => p.filter((c) => c.id !== id));

  if (isLoading) {
    return <div className="py-10 text-center text-muted-foreground">{tc("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={isSyncing}
            onClick={async () => {
              setIsSyncing(true);
              try {
                const res = await fetch("/api/app-home/sync", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                  notify.success(
                    `Synced: ${data.synced.categories} categories, ${data.synced.newArrivalBooks} arrivals, ${data.synced.trendingBooks} trending`,
                  );
                  queryClient.invalidateQueries({ queryKey: ["app-home"] });
                } else {
                  notify.error(data.error || "Sync failed");
                }
              } catch {
                notify.error("Sync failed");
              } finally {
                setIsSyncing(false);
              }
            }}
          >
            <FontAwesomeIcon icon={faRotate} spin={isSyncing} className="mr-1.5 h-3.5 w-3.5" />
            {isSyncing ? "Syncing..." : "Sync All"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <FontAwesomeIcon icon={faFloppyDisk} className="mr-2 size-4" />
            {saving ? tc("loading") : tc("save")}
          </Button>
        </div>
      </div>

      {/* New Arrival Books */}
      <CollapsibleSection title={t("newArrivals")} count={newArrivals.length}>
        <SortableList
          items={newArrivals}
          onReorder={setNewArrivals}
          renderItem={(book) => (
            <div className="flex items-center gap-3">
              <img src={book.coverUrl} alt={book.title} className="size-10 rounded object-cover" />
              <span className="flex-1 truncate text-sm font-medium">{book.title}</span>
              {book.price && <span className="text-xs text-muted-foreground">{book.price}</span>}
              <Button variant="ghost" size="icon" onClick={() => removeNewArrival(book.id)}>
                <FontAwesomeIcon icon={faTrash} className="size-4 text-destructive" />
              </Button>
            </div>
          )}
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setPickerOpen("newArrival")}
        >
          <FontAwesomeIcon icon={faPlus} className="mr-1 size-4" /> {t("addNewArrival")}
        </Button>
      </CollapsibleSection>

      {/* Trending Books */}
      <CollapsibleSection title={t("trendingBooks")} count={trending.length}>
        <SortableList
          items={trending}
          onReorder={setTrending}
          renderItem={(book, index) => (
            <div className="flex items-center gap-3">
              <span className="w-6 text-center text-sm font-bold text-muted-foreground">
                #{index + 1}
              </span>
              <img src={book.imageUrl} alt={book.title} className="size-10 rounded object-cover" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{book.title}</p>
                <p className="truncate text-xs text-muted-foreground">{book.subtitle}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeTrending(book.id)}>
                <FontAwesomeIcon icon={faTrash} className="size-4 text-destructive" />
              </Button>
            </div>
          )}
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setPickerOpen("trending")}
        >
          <FontAwesomeIcon icon={faPlus} className="mr-1 size-4" /> {t("addTrending")}
        </Button>
      </CollapsibleSection>

      {/* Categories */}
      <CollapsibleSection title={t("categories")} count={categories.length}>
        <SortableList
          items={categories}
          onReorder={setCategories}
          renderItem={(cat) => (
            <div className="flex items-center gap-3">
              <img
                src={cat.iconUrl}
                alt={cat.displayName}
                className="size-8 rounded object-cover"
              />
              <span className="flex-1 truncate text-sm font-medium">{cat.displayName}</span>
              <Badge variant={cat.isPublic ? "default" : "secondary"}>
                {cat.isPublic ? "Public" : "Hidden"}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => removeCategory(cat.id)}>
                <FontAwesomeIcon icon={faTrash} className="size-4 text-destructive" />
              </Button>
            </div>
          )}
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setPickerOpen("category")}
        >
          <FontAwesomeIcon icon={faPlus} className="mr-1 size-4" /> {t("addCategory")}
        </Button>
      </CollapsibleSection>

      {/* Picker Dialogs */}
      <ItemPickerDialog
        open={pickerOpen === "newArrival"}
        onOpenChange={(o) => !o && setPickerOpen(null)}
        title={t("addNewArrival")}
        items={allBooks as Array<Record<string, unknown> & { id: string }>}
        isLoading={booksLoading}
        displayField="title"
        imageField="coverUrl"
        selectedIds={newArrivals.map((b) => b.id)}
        onConfirm={handleNewArrivalPick}
      />
      <ItemPickerDialog
        open={pickerOpen === "trending"}
        onOpenChange={(o) => !o && setPickerOpen(null)}
        title={t("addTrending")}
        items={allBooks as Array<Record<string, unknown> & { id: string }>}
        isLoading={booksLoading}
        displayField="title"
        imageField="coverUrl"
        selectedIds={trending.map((b) => b.id)}
        onConfirm={handleTrendingPick}
      />
      <ItemPickerDialog
        open={pickerOpen === "category"}
        onOpenChange={(o) => !o && setPickerOpen(null)}
        title={t("addCategory")}
        items={allCategories as Array<Record<string, unknown> & { id: string }>}
        isLoading={catsLoading}
        displayField="displayName"
        imageField="iconUrl"
        selectedIds={categories.map((c) => c.id)}
        onConfirm={handleCategoryPick}
      />
    </div>
  );
}
