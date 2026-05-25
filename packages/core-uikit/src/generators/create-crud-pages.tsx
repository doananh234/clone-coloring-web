import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import type { CrudPagesConfig, CrudPages, FieldConfig } from "./types";
import { appApi } from "../api/client";
import { buildSchemaFromFields } from "./build-schema-from-fields";
import { DataTable } from "../components/crud/data-table";
import { FormBuilder } from "../components/crud/form-builder";
import { DetailView } from "../components/crud/detail-view";
import { FilterBar } from "../components/crud/filter-bar";
import { ConfirmDialog } from "../components/crud/confirm-dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { useRestGetAll, useRestGetOne, useRestMutation } from "../api/hooks/use-rest-api";
import {
  useFirestoreGetAll,
  useFirestoreGetOne,
  useFirestoreMutation,
} from "../firebase/use-firestore-crud";
import { firestoreDelete } from "../firebase/firestore-helpers";
import { useFirestoreOptional } from "../firebase/use-firestore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faPencil, faTrash, faPlus, faArrowLeft } from "@fortawesome/pro-regular-svg-icons";
import type { SortParam } from "../types";

// --- URL Search Params Hook ---
function useSearchParams() {
  const [, forceUpdate] = useState(0);

  const get = useCallback((key: string): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }, []);

  const set = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === undefined) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", newUrl);
    forceUpdate((n) => n + 1);
  }, []);

  return { get, set };
}

// --- Translated field helpers ---
function useTranslatedFields(fields: FieldConfig[], ns: string | undefined) {
  const { t } = useTranslation(ns ?? "common");
  const { t: tc } = useTranslation("common");

  /** Resolve label: if namespace provided, try t(`fields.${name}`), fallback to field.label */
  const fieldLabel = useCallback(
    (field: FieldConfig) => {
      if (!ns) return field.label;
      const key = `fields.${field.name}`;
      const translated = t(key);
      // i18next returns the key if not found
      return translated === key ? field.label : translated;
    },
    [ns, t],
  );

  /** Resolve option label: try t(`options.${fieldName}.${value}`), fallback to option.label */
  const optionLabel = useCallback(
    (fieldName: string, option: { label: string; value: string }) => {
      if (!ns) return option.label;
      const key = `options.${fieldName}.${option.value}`;
      const translated = t(key);
      return translated === key ? option.label : translated;
    },
    [ns, t],
  );

  /** Entity title: try t("title"), fallback to entityName */
  const entityTitle = useCallback(
    (entityName: string) => {
      if (!ns) return entityName;
      const translated = t("title");
      return translated === "title" ? entityName : translated;
    },
    [ns, t],
  );

  return { fieldLabel, optionLabel, entityTitle, t, tc };
}

/** Resolve a potentially relative URL using an optional base URL */
function resolveImageUrl(url: string | undefined | null, baseUrl?: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (baseUrl) return `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

function buildColumns<T>(
  fields: FieldConfig[],
  fieldLabel: (f: FieldConfig) => string,
  tc: (key: string) => string,
  onView: (row: T) => void,
  onEdit: (row: T) => void,
  onDelete: (row: T) => void,
  customActions?: (row: T) => React.ReactNode,
  imageBaseUrl?: string,
): ColumnDef<T, unknown>[] {
  const cols: ColumnDef<T, unknown>[] = fields
    .filter((f) => f.showInList !== false)
    .map((field) => {
      // url-image: show thumbnail in list
      if (field.type === "url-image") {
        return {
          accessorKey: field.name,
          header: fieldLabel(field),
          enableSorting: field.sortable ?? false,
          cell: ({ row }: { row: { original: T } }) => {
            const raw = (row.original as Record<string, unknown>)[field.name] as string;
            const url = resolveImageUrl(raw, imageBaseUrl);
            return url ? (
              <img
                src={url}
                alt=""
                className="h-8 w-8 rounded object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span className="text-muted-foreground">&mdash;</span>
            );
          },
        };
      }
      // date: format as localized date string
      if (field.type === "date") {
        return {
          accessorKey: field.name,
          header: fieldLabel(field),
          enableSorting: field.sortable ?? false,
          cell: ({ row }: { row: { original: T } }) => {
            const val = (row.original as Record<string, unknown>)[field.name];
            if (!val) return <span className="text-muted-foreground">&mdash;</span>;
            if (typeof val === "string") {
              const d = new Date(val);
              return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
            }
            if (typeof val === "number") {
              return new Date(val).toLocaleDateString();
            }
            // Handle Firestore Timestamp objects
            if (typeof val === "object" && val !== null) {
              const obj = val as Record<string, unknown>;
              // _Timestamp with toDate() on prototype
              if (typeof obj.toDate === "function") {
                return (obj as { toDate(): Date }).toDate().toLocaleDateString();
              }
              // Plain {seconds, nanoseconds}
              if (typeof obj.seconds === "number") {
                return new Date(obj.seconds * 1000).toLocaleDateString();
              }
              // Empty or corrupt timestamp object — show dash
              return <span className="text-muted-foreground">&mdash;</span>;
            }
            return String(val);
          },
        };
      }
      // boolean: show Yes/No badge
      if (field.type === "boolean") {
        return {
          accessorKey: field.name,
          header: fieldLabel(field),
          enableSorting: field.sortable ?? false,
          cell: ({ row }: { row: { original: T } }) => {
            const val = (row.original as Record<string, unknown>)[field.name];
            return val ? (
              <span className="text-xs font-medium text-green-600">Yes</span>
            ) : (
              <span className="text-xs text-muted-foreground">No</span>
            );
          },
        };
      }
      return {
        accessorKey: field.name,
        header: fieldLabel(field),
        enableSorting: field.sortable ?? false,
      };
    });

  cols.push({
    id: "actions",
    header: tc("actions"),
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex gap-1">
          {customActions?.(data)}
          <Button variant="ghost" size="icon" onClick={() => onView(data)}>
            <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onEdit(data)}>
            <FontAwesomeIcon icon={faPencil} className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(data)}>
            <FontAwesomeIcon icon={faTrash} className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      );
    },
  });

  return cols;
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  }
}

export function createCrudPages<T extends { id: string }>(config: CrudPagesConfig<T>): CrudPages {
  const {
    entityName,
    basePath,
    apiUrl,
    dataSource,
    fields,
    namespace,
    navigate: navigateFn,
    formSchema: customSchema,
    listActions,
    pageSize = 20,
    imageBaseUrl,
  } = config;

  const isFirestore = dataSource?.type === "firestore";
  const collectionPath = isFirestore ? dataSource.collection : "";

  const schema = customSchema ?? buildSchemaFromFields(fields);

  const filterOptionFields = fields.filter((f) => f.filterable && f.options);

  const navigate =
    navigateFn ??
    ((path: string) => {
      window.location.href = path;
    });

  // --- List Page ---
  function ListPage() {
    const { fieldLabel, optionLabel, entityTitle, tc } = useTranslatedFields(fields, namespace);
    const searchParams = useSearchParams();
    const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
    const firestore = useFirestoreOptional();

    const formFields = fields
      .filter((f) => f.showInForm !== false)
      .map((f) => ({
        name: f.name,
        label: fieldLabel(f),
        type: f.type === "relation" ? ("select" as const) : f.type,
        options: f.options?.map((o) => ({ label: optionLabel(f.name, o), value: o.value })),
        subFields: f.subFields,
        readOnly: f.readOnly,
      }));

    const filterOptions = filterOptionFields.map((f) => ({
      name: f.name,
      label: fieldLabel(f),
      options: f.options!.map((o) => ({ label: optionLabel(f.name, o), value: o.value })),
    }));

    // Read state from URL
    const page = Number(searchParams.get("page") || "1");
    const search = searchParams.get("search") || "";
    const sortParam = searchParams.get("sort");
    const sort: SortParam[] = useMemo(() => {
      if (!sortParam) return [];
      try {
        return JSON.parse(sortParam);
      } catch {
        return [];
      }
    }, [sortParam]);

    const filters = useMemo(() => {
      const f: Record<string, unknown> = {};
      if (search) f.search = search;
      for (const fo of filterOptionFields) {
        const val = searchParams.get(fo.name);
        if (val) f[fo.name] = val;
      }
      return f;
    }, [search, searchParams]);

    // Firestore hook (only active when isFirestore)
    const firestoreResult = useFirestoreGetAll<T>({
      entityName,
      collectionPath,
      orderByField: isFirestore ? dataSource.orderBy?.field : undefined,
      orderByDirection: isFirestore ? dataSource.orderBy?.direction : undefined,
      pageSize,
      filters,
      searchFields: isFirestore ? dataSource.searchFields : undefined,
      searchTerm: search || undefined,
      enabled: isFirestore,
      firestore,
    });

    // REST hook (only active when NOT isFirestore)
    const restResult = useRestGetAll<T>({
      entityName,
      url: apiUrl ?? "",
      page,
      limit: pageSize,
      sort,
      filters,
      enabled: !isFirestore,
    });

    // Unified data
    const data = isFirestore ? firestoreResult.data : restResult.data;
    const meta = isFirestore ? undefined : restResult.meta;
    const isLoading = isFirestore ? firestoreResult.isLoading : restResult.isLoading;
    const refresh = isFirestore ? firestoreResult.refresh : restResult.refresh;

    const columns =
      config.columns ??
      buildColumns<T>(
        fields,
        fieldLabel,
        tc,
        (row) => navigate(`${basePath}/${row.id}`),
        (row) => navigate(`${basePath}/${row.id}/edit`),
        (row) => setDeleteTarget(row),
        listActions,
        imageBaseUrl,
      );

    const title = entityTitle(entityName);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{title}</h1>
          <Button onClick={() => navigate(`${basePath}/new`)}>
            <FontAwesomeIcon icon={faPlus} className="mr-2 h-4 w-4" />
            {tc("create")}
          </Button>
        </div>
        <FilterBar
          searchPlaceholder={`${tc("search")}...`}
          filters={filterOptions}
          defaultSearch={search}
          defaultFilters={Object.fromEntries(
            filterOptionFields.map((fo) => [fo.name, searchParams.get(fo.name) || ""]),
          )}
          onSearch={(val) => searchParams.set({ search: val || null, page: null })}
          onFilterChange={(f) => {
            const updates: Record<string, string | null> = { page: null };
            for (const fo of filterOptionFields) {
              updates[fo.name] = f[fo.name] || null;
            }
            searchParams.set(updates);
          }}
        />
        <DataTable
          columns={columns}
          data={data}
          meta={meta}
          isLoading={isLoading}
          initialSort={sort}
          onPageChange={(p) => searchParams.set({ page: p > 1 ? String(p) : null })}
          onSortChange={(s) =>
            searchParams.set({ sort: s.length ? JSON.stringify(s) : null, page: null })
          }
        />
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={tc("delete")}
          description={`${tc("confirm")}?`}
          variant="destructive"
          confirmLabel={tc("delete")}
          isLoading={false}
          onConfirm={() => {
            if (deleteTarget) {
              if (isFirestore && firestore) {
                firestoreDelete(firestore, collectionPath, deleteTarget.id).then(() => {
                  setDeleteTarget(null);
                  refresh();
                });
              } else {
                appApi.delete(`${apiUrl}/${deleteTarget.id}`).then(() => {
                  setDeleteTarget(null);
                  refresh();
                });
              }
            }
          }}
        />
      </div>
    );
  }

  // --- Create Page ---
  function CreatePage() {
    const { fieldLabel, optionLabel, entityTitle, tc } = useTranslatedFields(fields, namespace);
    const firestore = useFirestoreOptional();

    const formFields = fields
      .filter((f) => f.showInForm !== false)
      .map((f) => ({
        name: f.name,
        label: fieldLabel(f),
        type: f.type === "relation" ? ("select" as const) : f.type,
        options: f.options?.map((o) => ({ label: optionLabel(f.name, o), value: o.value })),
        subFields: f.subFields,
        readOnly: f.readOnly,
      }));

    const restMutation = useRestMutation<T>({
      entityName,
      url: apiUrl ?? "",
      method: "POST",
    });

    const firestoreMutation = useFirestoreMutation<T>({
      entityName,
      collectionPath,
      method: "POST",
      firestore,
    });

    const mutation = isFirestore ? firestoreMutation : restMutation;

    const title = entityTitle(entityName);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">
            {tc("create")} {title}
          </h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <FormBuilder
              fields={formFields}
              schema={schema as any}
              onSubmit={(data) => {
                mutation.mutate(data, {
                  onSuccess: () => navigate(basePath),
                } as never);
              }}
              isLoading={mutation.isLoading}
              submitLabel={tc("create")}
              cancelLabel={tc("cancel")}
              onCancel={goBack}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Edit Page ---
  function EditPage() {
    const { fieldLabel, optionLabel, entityTitle, tc } = useTranslatedFields(fields, namespace);
    const id = window.location.pathname.split("/").filter(Boolean).at(-2) ?? "";
    const firestore = useFirestoreOptional();

    const formFields = fields
      .filter((f) => f.showInForm !== false)
      .map((f) => ({
        name: f.name,
        label: fieldLabel(f),
        type: f.type === "relation" ? ("select" as const) : f.type,
        options: f.options?.map((o) => ({ label: optionLabel(f.name, o), value: o.value })),
        subFields: f.subFields,
        readOnly: f.readOnly,
      }));

    const restData = useRestGetOne<T>({
      entityName,
      url: `${apiUrl}/:id`,
      pathParams: { id },
      enabled: !isFirestore && !!id,
    });

    const firestoreData = useFirestoreGetOne<T>({
      entityName,
      collectionPath,
      docId: id,
      enabled: isFirestore && !!id,
      firestore,
    });

    const { data, isLoading: isFetching } = isFirestore ? firestoreData : restData;

    const restMutation = useRestMutation<T>({
      entityName,
      url: `${apiUrl}/:id`,
      method: "PUT",
      pathParams: { id },
    });

    const firestoreMutation = useFirestoreMutation<T>({
      entityName,
      collectionPath,
      method: "PUT",
      docId: id,
      firestore,
    });

    const mutation = isFirestore ? firestoreMutation : restMutation;

    const title = entityTitle(entityName);

    if (isFetching) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">{tc("loading")}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">
            {tc("edit")} {title}
          </h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <FormBuilder
              fields={formFields}
              schema={schema as any}
              defaultValues={data as Record<string, unknown>}
              onSubmit={(formData) => {
                mutation.mutate(formData, {
                  onSuccess: () => navigate(`${basePath}/${id}`),
                } as never);
              }}
              isLoading={mutation.isLoading}
              submitLabel={tc("save")}
              cancelLabel={tc("cancel")}
              onCancel={goBack}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Detail Page ---
  function DetailPage() {
    const { fieldLabel, entityTitle, tc } = useTranslatedFields(fields, namespace);
    const id = window.location.pathname.split("/").filter(Boolean).at(-1) ?? "";
    const firestore = useFirestoreOptional();

    const detailFields = fields
      .filter((f) => f.showInDetail !== false)
      .map((f) => ({
        name: f.name,
        label: fieldLabel(f),
        type: f.type === "select" || f.type === "relation" ? ("text" as const) : f.type,
        subFields: f.subFields,
      }));

    const restData = useRestGetOne<T>({
      entityName,
      url: `${apiUrl}/:id`,
      pathParams: { id },
      enabled: !isFirestore && !!id,
    });

    const firestoreData = useFirestoreGetOne<T>({
      entityName,
      collectionPath,
      docId: id,
      enabled: isFirestore && !!id,
      firestore,
    });

    const { data, isLoading } = isFirestore ? firestoreData : restData;

    const title = entityTitle(entityName);

    if (isLoading || !data) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">{tc("loading")}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">
              {title} {tc("details")}
            </h1>
          </div>
          <Button onClick={() => navigate(`${basePath}/${id}/edit`)}>
            <FontAwesomeIcon icon={faPencil} className="mr-2 h-4 w-4" />
            {tc("edit")}
          </Button>
        </div>
        <DetailView
          data={data as Record<string, unknown>}
          fields={detailFields as any}
          imageBaseUrl={imageBaseUrl}
        />
      </div>
    );
  }

  return { ListPage, CreatePage, EditPage, DetailPage };
}
