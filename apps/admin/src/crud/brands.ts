import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

export type BrandEntity = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  isPublic?: boolean;
  index?: number;
  coloringStyleId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const brandFields: FieldConfig[] = [
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
  { name: "logoUrl", label: "Logo", type: "url-image" },
  { name: "isPublic", label: "Public", type: "boolean" },
  { name: "index", label: "Sort Order", type: "number", sortable: true },
  {
    name: "coloringStyleId",
    label: "Default Coloring Style",
    type: "select",
    optionsUrl: "/api/coloring-styles",
    optionsValueField: "id",
    optionsLabelField: "name",
    showInList: false,
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

export const brandCrud = createCrudPages<BrandEntity>({
  entityName: "brands",
  basePath: "/backup/brands",
  apiUrl: "/api/brands",
  fields: brandFields,
  namespace: "brands",
  navigate: appNavigate,
  imageBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "",
});
