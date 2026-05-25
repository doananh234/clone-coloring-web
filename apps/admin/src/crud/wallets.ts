import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

export type WalletEntity = {
  id: string;
  balance?: number;
  currency?: string;
  updatedAt?: string;
};

export const walletFields: FieldConfig[] = [
  { name: "id", label: "User ID", type: "text", sortable: true },
  { name: "balance", label: "Balance", type: "number", sortable: true },
  { name: "currency", label: "Currency", type: "text" },
  { name: "updatedAt", label: "Updated", type: "date", showInForm: false },
];

export const walletCrud = createCrudPages<WalletEntity>({
  entityName: "wallets",
  basePath: "/wallets",
  dataSource: {
    type: "firestore",
    collection: "wallets",
    orderBy: { field: "updatedAt", direction: "desc" },
    searchFields: ["id"],
  },
  fields: walletFields,
  namespace: "wallets",
  navigate: appNavigate,
});
