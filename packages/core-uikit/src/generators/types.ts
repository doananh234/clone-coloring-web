import type { ColumnDef } from "@tanstack/react-table";
import type { ZodType } from "zod";
import type React from "react";

export type FieldConfig = {
  name: string;
  label: string;
  type:
    | "text"
    | "email"
    | "number"
    | "select"
    | "textarea"
    | "date"
    | "boolean"
    | "relation"
    | "nested-array"
    | "embedded-object"
    | "url-image"
    | "color";
  options?: { label: string; value: string }[];
  /**
   * Fetch options from an API endpoint at render time. When set, `options` is
   * ignored. Expected response shape: `{ data: T[] }` or `T[]`. Value + label
   * pulled from each item via `optionsValueField` (default "id") and
   * `optionsLabelField` (default "name" or "displayName" fallback).
   */
  optionsUrl?: string;
  optionsValueField?: string;
  optionsLabelField?: string;
  sortable?: boolean;
  filterable?: boolean;
  showInList?: boolean;
  showInDetail?: boolean;
  showInForm?: boolean;
  validation?: ZodType;
  /** Sub-fields for nested-array and embedded-object types */
  subFields?: FieldConfig[];
  /** Whether this field is read-only in forms */
  readOnly?: boolean;
};

export type CrudPagesConfig<T> = {
  entityName: string;
  basePath: string;
  apiUrl: string;
  fields: FieldConfig[];
  /** i18n namespace for this entity (e.g. "users"). Field labels use t(`fields.${field.name}`) from this namespace. */
  namespace?: string;
  /** Navigation function for SPA routing. E.g. (path) => router.navigate({ to: path }) */
  navigate?: (path: string) => void;
  columns?: ColumnDef<T, unknown>[];
  formSchema?: ZodType;
  listActions?: (row: T) => React.ReactNode;
  pageSize?: number;
  /** Base URL to prepend to relative image URLs (e.g. R2/S3 bucket URL) */
  imageBaseUrl?: string;
};

export type CrudPages = {
  ListPage: React.FC;
  CreatePage: React.FC;
  EditPage: React.FC;
  DetailPage: React.FC;
};
