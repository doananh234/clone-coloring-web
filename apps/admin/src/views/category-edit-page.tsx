import { useTranslation } from "react-i18next";
import { useFirestoreGetOne, useFirestoreMutation } from "@vx/core-uikit/firebase";
import { useFirestore } from "@vx/core-uikit/firebase";
import { Button, Input, Textarea, Switch, Label } from "@vx/core-uikit/components";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faFloppyDisk } from "@fortawesome/pro-regular-svg-icons";
import { DetailCard } from "@/components/detail-card";
import { UrlImageField } from "@vx/core-uikit/components";
import { appNavigate } from "@/lib/navigate";
import { useForm } from "react-hook-form";
import type { CategoryEntity } from "@/crud/categories";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function CategoryEditPage({ categoryId }: { categoryId: string }) {
  const { t } = useTranslation("categories");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const firestore = useFirestore();

  const { data: category, isLoading } = useFirestoreGetOne<CategoryEntity>({
    entityName: "categories",
    collectionPath: "categories",
    docId: categoryId,
    firestore,
  });

  const mutation = useFirestoreMutation<CategoryEntity>({
    entityName: "categories",
    collectionPath: "categories",
    method: "PUT",
    docId: categoryId,
    firestore,
  });

  const form = useForm<Record<string, unknown>>({
    values: category ? (category as unknown as Record<string, unknown>) : undefined,
  });

  const watchIconUrl = form.watch("iconUrl") as string;

  function onSubmit(data: Record<string, unknown>) {
    const { id, createdAt, updatedAt, books, ...payload } = data;
    if (payload.index !== undefined) payload.index = Number(payload.index);
    mutation.mutate(payload, {
      onSuccess: () => appNavigate(`/categories/${categoryId}`),
    } as never);
  }

  if (isLoading || !category) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">
            {tc("edit")}: {category.displayName}
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

          <div className="flex h-[180px] items-center justify-center overflow-hidden rounded-lg border bg-white">
            {watchIconUrl ? (
              <img
                src={resolveUrl(watchIconUrl)}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-6xl">📁</span>
            )}
          </div>

          <DetailCard title="Stats">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Books</dt>
                <dd className="font-medium">{(category.books ?? []).length} books</dd>
              </div>
            </dl>
          </DetailCard>
        </div>

        {/* RIGHT — Form */}
        <div className="min-w-0 flex-1 space-y-4">
          <DetailCard title="Basic Information">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.displayName")} *</Label>
                <Input {...form.register("displayName")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.name")} *</Label>
                <Input {...form.register("name")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.description")}</Label>
                <Textarea {...form.register("description")} rows={3} />
              </div>
            </div>
          </DetailCard>

          <DetailCard title="Settings">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.iconUrl")}</Label>
                <UrlImageField
                  value={(form.watch("iconUrl") as string) ?? ""}
                  onChange={(v) => form.setValue("iconUrl", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("fields.iconPrompt")}</Label>
                <Textarea {...form.register("iconPrompt")} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t("fields.index")}</Label>
                  <Input type="number" {...form.register("index")} />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch
                    checked={!!form.watch("isPublic")}
                    onCheckedChange={(v) => form.setValue("isPublic", v)}
                  />
                  <Label className="text-sm font-medium">{t("fields.isPublic")}</Label>
                </div>
              </div>
            </div>
          </DetailCard>
        </div>
      </div>
    </form>
  );
}
