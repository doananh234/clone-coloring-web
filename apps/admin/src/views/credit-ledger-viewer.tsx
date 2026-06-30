import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRestGetAll } from "@vx/core-uikit/api";
import { DataTable, Badge, Button } from "@vx/core-uikit/components";
import { FilterBar } from "@vx/core-uikit/components";
import type { ColumnDef } from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/pro-regular-svg-icons";
import Link from "next/link";

// --- Types ---

type CreditLedgerEntry = {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
};

// --- Amount formatting helpers ---

function formatAmount(amount: number): string {
  const prefix = amount >= 0 ? "+" : "";
  return `${prefix}${amount}`;
}

function amountColorClass(amount: number): string {
  if (amount > 0) return "text-green-600 dark:text-green-400 font-medium";
  if (amount < 0) return "text-red-600 dark:text-red-400 font-medium";
  return "text-muted-foreground";
}

// --- Component ---

export function CreditLedgerViewer() {
  const { t } = useTranslation("creditLedger");
  const [searchTerm, setSearchTerm] = useState("");

  const [page, setPage] = useState(1);
  const { data: entries, meta, isLoading } = useRestGetAll<CreditLedgerEntry>({
    entityName: "creditLedger",
    url: "/api/credit-ledger",
    page,
    limit: 100,
    filters: searchTerm ? { search: searchTerm } : undefined,
  });
  const hasMore = meta ? page < meta.totalPages : false;
  const goToNextPage = () => setPage((p) => p + 1);
  const goToPrevPage = () => setPage((p) => Math.max(1, p - 1));
  const goToFirstPage = () => setPage(1);

  const columns = useMemo<ColumnDef<CreditLedgerEntry, unknown>[]>(
    () => [
      {
        accessorKey: "userId",
        header: t("fields.userId"),
        cell: ({ getValue }) => {
          const userId = getValue<string>();
          return (
            <Link href={`/users/${userId}`} className="text-primary underline hover:no-underline">
              {userId}
            </Link>
          );
        },
      },
      {
        accessorKey: "amount",
        header: t("fields.amount"),
        cell: ({ getValue }) => {
          const amount = getValue<number>();
          return <span className={amountColorClass(amount)}>{formatAmount(amount)}</span>;
        },
      },
      {
        accessorKey: "type",
        header: t("fields.type"),
        cell: ({ getValue }) => (
          <Badge variant="outline" className="capitalize">
            {getValue<string>()}
          </Badge>
        ),
      },
      {
        accessorKey: "description",
        header: t("fields.description"),
        cell: ({ getValue }) => {
          const desc = getValue<string>();
          return desc ? (
            <span className="text-sm">{desc}</span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: t("fields.createdAt"),
        cell: ({ getValue }) => {
          const dateStr = getValue<string>();
          if (!dateStr) return <span className="text-muted-foreground">&mdash;</span>;
          return new Date(dateStr).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        },
      },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => history.back()}>
          <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      {/* Search */}
      <FilterBar
        searchPlaceholder={t("title")}
        defaultSearch={searchTerm}
        onSearch={setSearchTerm}
      />

      {/* Table */}
      <DataTable<CreditLedgerEntry> columns={columns} data={entries} isLoading={isLoading} />

      {/* Pagination controls */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={goToFirstPage} disabled={page === 1}>
            First
          </Button>
          <Button variant="outline" size="sm" onClick={goToPrevPage} disabled={page === 1}>
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" onClick={goToNextPage} disabled={!hasMore}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
