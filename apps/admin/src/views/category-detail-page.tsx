import { useTranslation } from "react-i18next";
import { useFirestoreGetOne } from "@vx/core-uikit/firebase";
import { useFirestore } from "@vx/core-uikit/firebase";
import { Badge, Button, Separator } from "@vx/core-uikit/components";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPencil } from "@fortawesome/pro-regular-svg-icons";
import { DetailCard } from "@/components/detail-card";
import { appNavigate } from "@/lib/navigate";
import type { CategoryEntity } from "@/crud/categories";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function CategoryDetailPage({ categoryId }: { categoryId: string }) {
  const { t } = useTranslation("categories");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const firestore = useFirestore();

  const {
    data: category,
    isLoading,
    refresh,
  } = useFirestoreGetOne<CategoryEntity>({
    entityName: "categories",
    collectionPath: "categories",
    docId: categoryId,
    firestore,
  });

  if (isLoading || !category) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  const books = category.books ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{category.displayName}</h1>
          <Badge variant={category.isPublic ? "default" : "secondary"}>
            {category.isPublic ? "Public" : "Hidden"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => appNavigate(`/categories/${categoryId}/edit`)}
          >
            <FontAwesomeIcon icon={faPencil} className="mr-1.5 h-3.5 w-3.5" />
            {tc("edit")}
          </Button>
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex gap-6">
        {/* LEFT PANEL */}
        <div className="w-[280px] shrink-0 space-y-4 self-start sticky top-4">
          {/* Icon */}
          <div className="flex h-[180px] items-center justify-center overflow-hidden rounded-lg border bg-white">
            {category.iconUrl ? (
              <img
                src={resolveUrl(category.iconUrl)}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-6xl">📁</span>
            )}
          </div>

          {/* Quick Stats */}
          <DetailCard title="Quick Stats">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("fields.index")}</dt>
                <dd className="font-medium">{category.index ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("fields.books")}</dt>
                <dd className="font-medium">{books.length} books</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("fields.isPublic")}</dt>
                <dd
                  className={
                    category.isPublic ? "font-medium text-green-600" : "text-muted-foreground"
                  }
                >
                  {category.isPublic ? "Public" : "Hidden"}
                </dd>
              </div>
            </dl>
          </DetailCard>

          {/* Icon Prompt */}
          {category.iconPrompt && (
            <DetailCard title={t("fields.iconPrompt")}>
              <p className="text-xs italic leading-relaxed text-muted-foreground">
                {category.iconPrompt}
              </p>
            </DetailCard>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Category Info */}
          <DetailCard title={t("title")}>
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("fields.displayName")}</dt>
              <dd>{category.displayName}</dd>
              <dt className="text-muted-foreground">{t("fields.name")}</dt>
              <dd className="font-mono text-xs text-muted-foreground">{category.name}</dd>
            </dl>
            {category.description && (
              <>
                <Separator className="my-3" />
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("fields.description")}</p>
                  <p className="text-sm leading-relaxed">{category.description}</p>
                </div>
              </>
            )}
          </DetailCard>

          {/* Books Grid */}
          {books.length > 0 && (
            <DetailCard title={t("fields.books")} subtitle={`${books.length} books`}>
              <div className="grid grid-cols-4 gap-3">
                {books.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    className="overflow-hidden rounded-lg border text-left hover:shadow-md transition-shadow"
                    onClick={() => appNavigate(`/books/${book.id}`)}
                  >
                    <div className="aspect-[3/4] bg-muted">
                      {book.coverUrl ? (
                        <img
                          src={resolveUrl(book.coverUrl)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                          No cover
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold">{book.title}</p>
                      {book.price && <p className="text-xs text-muted-foreground">${book.price}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </DetailCard>
          )}
        </div>
      </div>
    </div>
  );
}
