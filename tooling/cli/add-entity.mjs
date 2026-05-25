#!/usr/bin/env node

import fs from "fs";
import path from "path";

const [,, entityName, ...flags] = process.argv;

if (!entityName) {
  console.error("Usage: yarn vx:add-entity <entityName> [--app=admin]");
  console.error("Example: yarn vx:add-entity products");
  process.exit(1);
}

const appName = flags.find((f) => f.startsWith("--app="))?.split("=")[1] ?? "admin";
const appDir = path.resolve(`apps/${appName}/src`);
const singular = entityName.endsWith("s") ? entityName.slice(0, -1) : entityName;
const paramName = `$${singular}Id`;
const capitalName = entityName.charAt(0).toUpperCase() + entityName.slice(1);
const capitalSingular = singular.charAt(0).toUpperCase() + singular.slice(1);

if (!fs.existsSync(appDir)) {
  console.error(`App directory not found: apps/${appName}/src`);
  process.exit(1);
}

// --- 1. CRUD config ---
const crudDir = path.join(appDir, "crud");
const crudFile = path.join(crudDir, `${entityName}.ts`);

if (fs.existsSync(crudFile)) {
  console.error(`CRUD config already exists: ${crudFile}`);
  process.exit(1);
}

fs.mkdirSync(crudDir, { recursive: true });
fs.writeFileSync(crudFile, `import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

export type ${capitalSingular}Entity = {
  id: string;
  name: string;
  // TODO: add your fields
};

export const ${entityName}Fields: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", sortable: true, filterable: true },
  // TODO: add your fields
];

export const ${entityName}Crud = createCrudPages<${capitalSingular}Entity>({
  entityName: "${entityName}",
  basePath: "/${entityName}",
  apiUrl: "/api/${entityName}",
  fields: ${entityName}Fields,
  namespace: "${entityName}",
  navigate: appNavigate,
});
`);
console.log(`  Created: src/crud/${entityName}.ts`);

// --- 2. Route files ---
const routeDir = path.join(appDir, "routes", entityName);
fs.mkdirSync(routeDir, { recursive: true });

const routeFiles = [
  { name: "index.tsx", routePath: `/${entityName}/`, component: `${entityName}Crud.ListPage` },
  { name: "new.tsx", routePath: `/${entityName}/new`, component: `${entityName}Crud.CreatePage` },
  { name: `${paramName}.tsx`, routePath: `/${entityName}/${paramName}`, component: `${entityName}Crud.DetailPage` },
  { name: `${paramName}_.edit.tsx`, routePath: `/${entityName}/${paramName}_/edit`, component: `${entityName}Crud.EditPage` },
];

for (const rf of routeFiles) {
  const filePath = path.join(routeDir, rf.name);
  fs.writeFileSync(filePath, `import { createFileRoute } from "@tanstack/react-router";
import { ${entityName}Crud } from "@/crud/${entityName}";

export const Route = createFileRoute("${rf.routePath}")({
  component: ${rf.component},
});
`);
  console.log(`  Created: src/routes/${entityName}/${rf.name}`);
}

// --- 3. i18n locale files ---
const locales = ["en", "vi", "ja"];
for (const locale of locales) {
  const localeDir = path.join(appDir, "i18n", "locales", locale);
  fs.mkdirSync(localeDir, { recursive: true });
  const localeFile = path.join(localeDir, `${entityName}.json`);
  if (!fs.existsSync(localeFile)) {
    fs.writeFileSync(localeFile, JSON.stringify({
      title: locale === "en" ? `${capitalName} Management` : `${capitalName}`,
      fields: { name: locale === "en" ? "Name" : "name" },
    }, null, 2) + "\n");
    console.log(`  Created: src/i18n/locales/${locale}/${entityName}.json`);
  }
}

console.log(`
Done! Next steps:
  1. Edit src/crud/${entityName}.ts — add your entity type and fields
  2. Edit src/i18n/locales/*/${entityName}.json — add translations
  3. Register translations in src/main.tsx:

     import en${capitalName} from "./i18n/locales/en/${entityName}.json";
     import vi${capitalName} from "./i18n/locales/vi/${entityName}.json";
     import ja${capitalName} from "./i18n/locales/ja/${entityName}.json";
     registerTranslations("en", "${entityName}", en${capitalName});
     registerTranslations("vi", "${entityName}", vi${capitalName});
     registerTranslations("ja", "${entityName}", ja${capitalName});

  4. Add nav item in packages/core-uikit/src/components/layout/app-sidebar.tsx
  5. Add mock API handlers in apps/${appName}/mock-api.ts
`);
