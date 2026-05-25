"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFirestoreGetAll, useFirestore } from "@vx/core-uikit/firebase";
import { firestoreDelete } from "@vx/core-uikit/firebase";
import { Button, Badge, Input, Card, CardContent } from "@vx/core-uikit/components";
import { ConfirmDialog } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faMagnifyingGlass,
  faEye,
  faPencil,
  faTrash,
} from "@fortawesome/pro-regular-svg-icons";
import { appNavigate } from "@/lib/navigate";
import type { BookEntity } from "@/crud/books";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

// --- Filter types and logic ---

type FilterKey =
  | "all"
  | "public"
  | "private"
  | "premium"
  | "free"
  | "converted"
  | "not-converted"
  | "has-pages"
  | "no-pages";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
  { key: "premium", label: "Premium" },
  { key: "free", label: "Free" },
  { key: "converted", label: "Converted" },
  { key: "not-converted", label: "Not Converted" },
  { key: "has-pages", label: "Has Pages" },
  { key: "no-pages", label: "No Pages" },
];

function applyFilter(books: BookEntity[], filter: FilterKey): BookEntity[] {
  switch (filter) {
    case "public":
      return books.filter((b) => b.isPublic);
    case "private":
      return books.filter((b) => !b.isPublic);
    case "premium":
      return books.filter((b) => b.isPremium);
    case "free":
      return books.filter((b) => !b.isPremium);
    case "converted":
      return books.filter((b) => b.isConverted);
    case "not-converted":
      return books.filter((b) => !b.isConverted);
    case "has-pages":
      return books.filter((b) => (b.coloringPages?.length ?? 0) > 0);
    case "no-pages":
      return books.filter((b) => (b.coloringPages?.length ?? 0) === 0);
    default:
      return books;
  }
}

// --- Component ---

export function BookListPage() {
  const { t } = useTranslation("books");
  const { t: tc } = useTranslation("common");
  const firestore = useFirestore();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [deleteTarget, setDeleteTarget] = useState<BookEntity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: allBooks,
    isLoading,
    refresh,
  } = useFirestoreGetAll<BookEntity>({
    entityName: "books",
    collectionPath: "books",
    orderByField: "title",
    orderByDirection: "asc",
    pageSize: 500,
    firestore,
  });

  const filtered = useMemo(() => {
    let result = applyFilter(allBooks, filter);
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (b) => b.title?.toLowerCase().includes(lower) || b.category?.toLowerCase().includes(lower),
      );
    }
    return result;
  }, [allBooks, filter, search]);

  async function handleDelete() {
    if (!deleteTarget || !firestore) return;
    setIsDeleting(true);
    try {
      await firestoreDelete(firestore, "books", deleteTarget.id);
      notify.success("Book deleted");
      setDeleteTarget(null);
      refresh();
    } catch {
      notify.error("Failed to delete book");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {allBooks.length} books
          </p>
        </div>
        <Button onClick={() => appNavigate("/books/new")}>
          <FontAwesomeIcon icon={faPlus} className="mr-2 h-4 w-4" />
          {tc("create")}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search by title or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Book grid */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{tc("loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No books found</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onView={() => appNavigate(`/books/${book.id}`)}
              onEdit={() => appNavigate(`/books/${book.id}/edit`)}
              onDelete={() => setDeleteTarget(book)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={tc("delete")}
        description={`Delete "${deleteTarget?.title}"?`}
        variant="destructive"
        confirmLabel={tc("delete")}
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// --- BookCard sub-component ---

function BookCard({
  book,
  onView,
  onEdit,
  onDelete,
}: {
  book: BookEntity;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={onView}
    >
      {/* Cover image */}
      <div className="relative aspect-[3/4] bg-muted">
        {book.coverUrl ? (
          <img
            src={resolveUrl(book.coverUrl)}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No cover
          </div>
        )}
        {/* Status badges overlay */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {book.isPublic && (
            <span className="rounded bg-green-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Public
            </span>
          )}
          {book.isPremium && (
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Premium
            </span>
          )}
          {book.isConverted && (
            <span className="rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Converted
            </span>
          )}
        </div>
      </div>

      {/* Card content */}
      <CardContent className="p-3">
        <p className="truncate text-sm font-semibold">{book.title}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{book.category ?? "---"}</span>
          <span>·</span>
          <span>{book.coloringPages?.length ?? 0} pages</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1">
            {book.price ? (
              <Badge variant="secondary" className="text-[10px]">
                ${book.price}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Free
              </Badge>
            )}
            {book.badge && (
              <Badge variant="outline" className="text-[10px]">
                {book.badge}
              </Badge>
            )}
          </div>
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
            >
              <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <FontAwesomeIcon icon={faPencil} className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
