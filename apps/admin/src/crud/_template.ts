/**
 * CRUD Template — Copy this file to create a new entity
 *
 * Steps to add a new CRUD (e.g. "products"):
 *
 *   1. Copy this file → src/crud/products.ts
 *   2. Define your entity type, fields, and config
 *   3. Create locale files for i18n:
 *      - src/i18n/locales/en/products.json
 *      - src/i18n/locales/vi/products.json
 *      - src/i18n/locales/ja/products.json
 *   4. Register translations in src/main.tsx
 *   5. Create 4 route files:
 *      - src/routes/products/index.tsx       → component: productCrud.ListPage
 *      - src/routes/products/new.tsx         → component: productCrud.CreatePage
 *      - src/routes/products/$productId.tsx  → component: productCrud.DetailPage
 *      - src/routes/products/$productId_.edit.tsx → component: productCrud.EditPage
 *   6. Add nav item in src/components/app-sidebar.tsx
 *
 * --- Locale file structure ---
 *
 * {
 *   "title": "Product Management",       ← page title (List/Detail header)
 *   "fields": {
 *     "name": "Product Name",            ← table headers, form labels, detail labels
 *     "price": "Price",
 *     "category": "Category"
 *   },
 *   "options": {
 *     "category": {                      ← select/filter option labels
 *       "electronics": "Electronics",
 *       "clothing": "Clothing"
 *     }
 *   }
 * }
 *
 * Action labels (Create, Edit, Save, Cancel, Delete, Search, etc.)
 * come from the "common" namespace in core-uikit — no need to define them per entity.
 *
 * --- Field types ---
 * "text" | "email" | "number" | "select" | "textarea" | "date" | "boolean" | "relation"
 *
 * --- Field options ---
 *   - sortable: boolean       → enables column sorting
 *   - filterable: boolean     → shows in filter panel (needs options for select)
 *   - showInList: boolean     → show in table (default: true)
 *   - showInForm: boolean     → show in create/edit form (default: true)
 *   - showInDetail: boolean   → show in detail view (default: true)
 *   - options: { label, value }[] → for select/relation types
 *   - validation: ZodType     → custom zod validation per field
 */

import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

// 1. Define your entity type
export type TemplateEntity = {
  id: string;
  // add your fields here
};

// 2. Define fields (labels are fallbacks — i18n overrides via namespace)
export const templateFields: FieldConfig[] = [
  // { name: "fieldName", label: "Field Label", type: "text", sortable: true },
];

// 3. Create CRUD pages
export const templateCrud = createCrudPages<TemplateEntity>({
  entityName: "templates",     // used for API cache keys
  basePath: "/templates",       // URL base path
  apiUrl: "/api/templates",     // API endpoint
  fields: templateFields,
  namespace: "templates",       // i18n namespace — matches locale file name
  navigate: appNavigate,        // SPA navigation (no full page reload)
  // pageSize: 20,              // optional, default 20
  // formSchema: z.object({})   // optional, overrides auto-generated schema
});
