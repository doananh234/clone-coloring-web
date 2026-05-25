import { useTranslation } from "react-i18next";
import { useFirestoreGetOne, useFirestoreMutation } from "@vx/core-uikit/firebase";
import { useFirestore } from "@vx/core-uikit/firebase";
import { Button, Input, Textarea, Switch, Label, Badge, Combobox } from "@vx/core-uikit/components";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faFloppyDisk } from "@fortawesome/pro-regular-svg-icons";
import { DetailCard } from "@/components/detail-card";
import { ImageGrid, type ImageItem } from "@/components/image-grid";
import { ColorField } from "@vx/core-uikit/components";
import { appNavigate } from "@/lib/navigate";
import { useForm } from "react-hook-form";
import type { BookEntity } from "@/crud/books";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function BookEditPage({ bookId }: { bookId: string }) {
  const { t } = useTranslation("books");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const firestore = useFirestore();

  const { data: book, isLoading } = useFirestoreGetOne<BookEntity>({
    entityName: "books",
    collectionPath: "books",
    docId: bookId,
    firestore,
  });

  const mutation = useFirestoreMutation<BookEntity>({
    entityName: "books",
    collectionPath: "books",
    method: "PUT",
    docId: bookId,
    firestore,
  });

  const form = useForm<Record<string, unknown>>({
    values: book ? (book as unknown as Record<string, unknown>) : undefined,
  });

  const watchCoverUrl = form.watch("coverUrl") as string;
  const watchThumbnailUrl = form.watch("thumbnailUrl") as string;
  const watchSquareThumbnailUrl = form.watch("squareThumbnailUrl") as string;

  function onSubmit(data: Record<string, unknown>) {
    // Remove read-only fields
    const { id, createdAt, updatedAt, ...payload } = data;
    // Ensure specs is an object
    if (payload.specifications && typeof payload.specifications === "object") {
      const specs = payload.specifications as Record<string, unknown>;
      if (specs.pages) specs.pages = Number(specs.pages);
    }
    mutation.mutate(payload, {
      onSuccess: () => appNavigate(`/books/${bookId}`),
    } as never);
  }

  if (isLoading || !book) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  const coloringPages: ImageItem[] = (book.coloringPages ?? []).map((p) => ({
    id: p.id,
    url: p.url,
    isPublic: p.isPublic,
  }));

  const summaryPages: ImageItem[] = (book.summaryPages ?? []).map((p) => ({
    id: p.id,
    url: p.url,
    isPublic: p.isPublic,
  }));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">
            {tc("edit")}: {book.title}
          </h1>
        </div>
        <Button type="submit" disabled={mutation.isLoading}>
          <FontAwesomeIcon icon={faFloppyDisk} className="mr-1.5 h-3.5 w-3.5" />
          {mutation.isLoading ? tc("loading") : tc("save")}
        </Button>
      </div>

      {/* Split Panel */}
      <div className="flex gap-6">
        {/* LEFT — Preview */}
        <div className="w-[280px] shrink-0 space-y-4 self-start sticky top-4">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Preview</p>

          {/* Cover preview */}
          <div className="overflow-hidden rounded-lg border">
            {watchCoverUrl ? (
              <img
                src={resolveUrl(watchCoverUrl)}
                alt=""
                className="w-full object-cover"
                style={{ maxHeight: 240 }}
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center bg-muted text-sm text-muted-foreground">
                No cover
              </div>
            )}
          </div>

          {/* Thumbnails */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">3:4</p>
              {watchThumbnailUrl ? (
                <img
                  src={resolveUrl(watchThumbnailUrl)}
                  alt=""
                  className="h-14 w-full rounded border object-cover"
                />
              ) : (
                <div className="flex h-14 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                  —
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">1:1</p>
              {watchSquareThumbnailUrl ? (
                <img
                  src={resolveUrl(watchSquareThumbnailUrl)}
                  alt=""
                  className="h-14 w-full rounded border object-cover"
                />
              ) : (
                <div className="flex h-14 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                  —
                </div>
              )}
            </div>
          </div>

          {/* Coloring pages preview */}
          {coloringPages.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Coloring Pages ({coloringPages.length})
              </p>
              <ImageGrid
                images={coloringPages}
                resolveUrl={resolveUrl}
                columns={3}
                maxVisible={5}
              />
            </div>
          )}

          {/* Summary pages preview */}
          {summaryPages.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Summary Pages ({summaryPages.length})
              </p>
              <ImageGrid images={summaryPages} resolveUrl={resolveUrl} columns={3} maxVisible={5} />
            </div>
          )}
        </div>

        {/* RIGHT — Form */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Basic Info */}
          <DetailCard title="Basic Information">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.title")} *</Label>
                <Input {...form.register("title")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.subtitle")}</Label>
                <Input {...form.register("subtitle")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.description")}</Label>
                <Textarea {...form.register("description")} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.categoryId")}</Label>
                  <Input {...form.register("categoryId")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.badge")}</Label>
                  <Combobox
                    options={[
                      { value: "NEW", label: "NEW" },
                      { value: "HOT", label: "HOT" },
                      { value: "SALE", label: "SALE" },
                    ]}
                    value={(form.watch("badge") as string) ?? ""}
                    onValueChange={(v) => form.setValue("badge", v)}
                    placeholder="None"
                    searchPlaceholder="Search badges..."
                  />
                </div>
              </div>
            </div>
          </DetailCard>

          {/* Pricing */}
          <DetailCard title="Pricing">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.price")}</Label>
                <Input {...form.register("price")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.originalPrice")}</Label>
                <Input {...form.register("originalPrice")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.discount")}</Label>
                <Input {...form.register("discount")} />
              </div>
            </div>
          </DetailCard>

          {/* Image URLs */}
          <DetailCard title="Image URLs">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.coverUrl")} *</Label>
                <Input {...form.register("coverUrl")} className="font-mono text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.thumbnailUrl")}</Label>
                  <Input {...form.register("thumbnailUrl")} className="font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.squareThumbnailUrl")}</Label>
                  <Input {...form.register("squareThumbnailUrl")} className="font-mono text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.pdfUrl")}</Label>
                  <Input {...form.register("pdfUrl")} className="font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.tryoutPage")}</Label>
                  <Input {...form.register("tryoutPage")} className="font-mono text-xs" />
                </div>
              </div>
            </div>
          </DetailCard>

          {/* Specs + Settings side by side */}
          <div className="grid grid-cols-2 gap-4">
            <DetailCard title={t("fields.specifications")}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Pages</Label>
                  <Input type="number" {...form.register("specifications.pages")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Dimensions</Label>
                  <Input {...form.register("specifications.dimensions")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Age Range</Label>
                  <Input {...form.register("specifications.ageRange")} />
                </div>
              </div>
            </DetailCard>

            <DetailCard title="Settings">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!form.watch("isConverted")}
                    onCheckedChange={(v) => form.setValue("isConverted", v)}
                  />
                  <Label className="text-sm font-medium">{t("fields.isConverted")}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!form.watch("isRedesigned")}
                    onCheckedChange={(v) => form.setValue("isRedesigned", v)}
                  />
                  <Label className="text-sm font-medium">{t("fields.isRedesigned")}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!form.watch("isEditionConverted")}
                    onCheckedChange={(v) => form.setValue("isEditionConverted", v)}
                  />
                  <Label className="text-sm font-medium">{t("fields.isEditionConverted")}</Label>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.backgroundColor")}</Label>
                  <ColorField
                    value={(form.watch("backgroundColor") as string) ?? ""}
                    onChange={(v) => form.setValue("backgroundColor", v)}
                  />
                </div>
              </div>
            </DetailCard>
          </div>
        </div>
      </div>
    </form>
  );
}
