import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

export type BookEntity = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  category?: string;
  categoryId?: string;
  badge?: string;
  backgroundColor?: string;
  tryoutPage?: string;
  coverUrl: string;
  pdfUrl?: string;
  squareThumbnailUrl?: string;
  thumbnailUrl?: string;
  summaryPages?: { id: string; url: string; isPublic?: boolean }[];
  coloringPages: {
    id: string;
    url: string;
    isPublic?: boolean;
    coloredUrl?: string;
    coloringStyleId?: string;
  }[];
  specifications: { pages: number; dimensions?: string; ageRange?: string };
  isConverted?: boolean;
  isRedesigned?: boolean;
  isEditionConverted?: boolean;
  isPublic?: boolean;
  isPremium?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const coloringPageSubFields: FieldConfig[] = [
  { name: "id", label: "ID", type: "text" },
  { name: "url", label: "URL", type: "text" },
  { name: "isPublic", label: "Public", type: "boolean" },
  { name: "coloredUrl", label: "Colored URL", type: "text" },
  { name: "coloringStyleId", label: "Coloring Style", type: "text" },
];

const specificationsSubFields: FieldConfig[] = [
  { name: "pages", label: "Pages", type: "number" },
  { name: "dimensions", label: "Dimensions", type: "text" },
  { name: "ageRange", label: "Age Range", type: "text" },
];

export const bookFields: FieldConfig[] = [
  { name: "title", label: "Title", type: "text", sortable: true },
  { name: "subtitle", label: "Subtitle", type: "text", showInList: false },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    showInList: false,
  },
  { name: "price", label: "Price", type: "text", sortable: true },
  {
    name: "originalPrice",
    label: "Original Price",
    type: "text",
    showInList: false,
  },
  { name: "discount", label: "Discount", type: "text", showInList: false },
  {
    name: "categoryId",
    label: "Category ID",
    type: "text",
    showInList: false,
    filterable: true,
  },
  { name: "category", label: "Category", type: "text", showInForm: false },
  {
    name: "badge",
    label: "Badge",
    type: "select",
    filterable: true,
    options: [
      { label: "NEW", value: "NEW" },
      { label: "HOT", value: "HOT" },
      { label: "SALE", value: "SALE" },
    ],
  },
  {
    name: "backgroundColor",
    label: "Background Color",
    type: "color",
    showInList: false,
  },
  { name: "coverUrl", label: "Cover", type: "url-image" },
  {
    name: "thumbnailUrl",
    label: "Thumbnail",
    type: "url-image",
    showInList: false,
  },
  {
    name: "squareThumbnailUrl",
    label: "Square Thumbnail",
    type: "url-image",
    showInList: false,
  },
  {
    name: "tryoutPage",
    label: "Tryout Page",
    type: "url-image",
    showInList: false,
  },
  { name: "pdfUrl", label: "PDF URL", type: "text", showInList: false },
  {
    name: "coloringPages",
    label: "Coloring Pages",
    type: "nested-array",
    subFields: coloringPageSubFields,
    showInList: false,
  },
  {
    name: "summaryPages",
    label: "Summary Pages",
    type: "nested-array",
    subFields: coloringPageSubFields,
    showInList: false,
  },
  {
    name: "specifications",
    label: "Specifications",
    type: "embedded-object",
    subFields: specificationsSubFields,
    showInList: false,
  },
  {
    name: "isConverted",
    label: "Converted",
    type: "boolean",
    showInList: false,
  },
  {
    name: "isRedesigned",
    label: "Redesigned",
    type: "boolean",
    showInList: false,
  },
  {
    name: "isEditionConverted",
    label: "Edition Converted",
    type: "boolean",
    showInList: false,
  },
  { name: "isPublic", label: "Public", type: "boolean", showInList: false },
  { name: "isPremium", label: "Premium", type: "boolean", showInList: false },
  { name: "createdAt", label: "Created", type: "date", showInForm: false },
  {
    name: "updatedAt",
    label: "Updated",
    type: "date",
    showInList: false,
    showInForm: false,
  },
];

export const bookCrud = createCrudPages<BookEntity>({
  entityName: "books",
  basePath: "/books",
  dataSource: {
    type: "firestore",
    collection: "books",
    orderBy: { field: "title", direction: "asc" },
    searchFields: ["title", "category"],
  },
  fields: bookFields,
  namespace: "books",
  navigate: appNavigate,
  imageBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "",
});
