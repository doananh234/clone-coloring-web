import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

export type CategoryEntity = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  iconUrl: string;
  iconPrompt: string;
  isPublic?: boolean;
  index?: number;
  books?: {
    id: string;
    title: string;
    coverUrl: string;
    price?: string;
    badge?: string;
    order?: number;
  }[];
  createdAt?: string;
  updatedAt?: string;
};

const bookSummarySubFields: FieldConfig[] = [
  { name: "id", label: "ID", type: "text" },
  { name: "title", label: "Title", type: "text" },
  { name: "coverUrl", label: "Cover URL", type: "text" },
  { name: "price", label: "Price", type: "text" },
  { name: "badge", label: "Badge", type: "text" },
  { name: "order", label: "Order", type: "number" },
];

export const categoryFields: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", showInList: false },
  {
    name: "displayName",
    label: "Display Name",
    type: "text",
    sortable: true,
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    showInList: false,
  },
  { name: "iconUrl", label: "Icon", type: "url-image" },
  {
    name: "iconPrompt",
    label: "Icon Prompt",
    type: "textarea",
    showInList: false,
  },
  { name: "isPublic", label: "Public", type: "boolean" },
  { name: "index", label: "Sort Order", type: "number", sortable: true },
  {
    name: "books",
    label: "Books",
    type: "nested-array",
    subFields: bookSummarySubFields,
    showInList: false,
    showInForm: false,
    readOnly: true,
  },
  {
    name: "createdAt",
    label: "Created",
    type: "date",
    showInList: false,
    showInForm: false,
  },
  {
    name: "updatedAt",
    label: "Updated",
    type: "date",
    showInList: false,
    showInForm: false,
  },
];

export const categoryCrud = createCrudPages<CategoryEntity>({
  entityName: "categories",
  basePath: "/categories",
  dataSource: {
    type: "firestore",
    collection: "categories",
    orderBy: { field: "index", direction: "asc" },
    searchFields: ["displayName", "name"],
  },
  fields: categoryFields,
  namespace: "categories",
  navigate: appNavigate,
  imageBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "",
});
