import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

/**
 * User CRUD Configuration
 *
 * This is the ONLY file you need to create for a new CRUD.
 * It defines the entity name, API URL, base path, and field config.
 * All 4 pages (List, Create, Edit, Detail) are auto-generated.
 *
 * To add a new CRUD entity (e.g. "products"):
 *   1. Copy this file to src/crud/products.ts
 *   2. Change entityName, basePath, apiUrl, fields
 *   3. Create 4 route files (see src/routes/users/ for examples)
 *   4. Add navigation item in src/components/app-sidebar.tsx
 */

export type UserEntity = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export const userFields: FieldConfig[] = [
  {
    name: "name",
    label: "Name",
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    sortable: true,
  },
  {
    name: "role",
    label: "Role",
    type: "select",
    filterable: true,
    options: [
      { label: "Admin", value: "admin" },
      { label: "User", value: "user" },
      { label: "Editor", value: "editor" },
    ],
  },
];

export const userCrud = createCrudPages<UserEntity>({
  entityName: "users",
  basePath: "/users",
  apiUrl: "/api/users",
  fields: userFields,
  namespace: "users",
  navigate: appNavigate,
});
