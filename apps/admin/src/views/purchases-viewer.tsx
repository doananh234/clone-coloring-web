import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { useFirestore, normalizeTimestamps } from "@vx/core-uikit/firebase";
import { DataTable, Badge, Button } from "@vx/core-uikit/components";
import type { ColumnDef } from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/pro-regular-svg-icons";
import Link from "next/link";

// --- Types ---

type PurchaseStatus = "verified" | "pending" | "failed" | "refunded";

type Purchase = {
  id: string;
  bookId: string;
  platform: "ios" | "android";
  productId: string;
  status: PurchaseStatus;
  transactionId?: string;
  originalTransactionId?: string;
  environment?: string;
  purchaseToken?: string;
  orderId?: string | null;
  createdAt: string;
  updatedAt: string;
};

const ALL_STATUSES: PurchaseStatus[] = ["verified", "pending", "failed", "refunded"];

// --- Status badge color mapping ---

const statusStyles: Record<PurchaseStatus, string> = {
  verified: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  refunded: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

// --- Component ---

type PurchasesViewerProps = {
  userId: string;
};

export function PurchasesViewer({ userId }: PurchasesViewerProps) {
  const { t } = useTranslation("purchases");
  const firestore = useFirestore();
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | "all">("all");

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases", userId],
    queryFn: async () => {
      const colRef = collection(firestore, `users/${userId}/purchases`);
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...normalizeTimestamps(doc.data()),
      })) as Purchase[];
    },
  });

  const filteredPurchases = useMemo(() => {
    if (statusFilter === "all") return purchases;
    return purchases.filter((p) => p.status === statusFilter);
  }, [purchases, statusFilter]);

  const columns = useMemo<ColumnDef<Purchase, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: t("fields.purchaseId"),
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
      },
      {
        accessorKey: "bookId",
        header: t("fields.bookId"),
        cell: ({ getValue }) => {
          const bookId = getValue<string>();
          return (
            <Link href={`/books/${bookId}`} className="text-primary underline hover:no-underline">
              {bookId}
            </Link>
          );
        },
      },
      {
        accessorKey: "platform",
        header: t("fields.platform"),
        cell: ({ getValue }) => {
          const platform = getValue<string>();
          return (
            <Badge variant="outline" className="capitalize">
              {platform}
            </Badge>
          );
        },
      },
      {
        accessorKey: "productId",
        header: t("fields.productId"),
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
      },
      {
        accessorKey: "status",
        header: t("fields.status"),
        cell: ({ getValue }) => {
          const status = getValue<PurchaseStatus>();
          return <Badge className={statusStyles[status]}>{t(`statuses.${status}`)}</Badge>;
        },
      },
      {
        accessorKey: "transactionId",
        header: t("fields.transactionId"),
        cell: ({ getValue }) => {
          const txId = getValue<string>();
          return txId ? (
            <span className="font-mono text-xs">{txId}</span>
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

      {/* Status filter buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === "all" ? "default" : "outline"}
          onClick={() => setStatusFilter("all")}
        >
          {t("statuses.all")}
        </Button>
        {ALL_STATUSES.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={statusFilter === status ? "default" : "outline"}
            onClick={() => setStatusFilter(status)}
          >
            {t(`statuses.${status}`)}
          </Button>
        ))}
      </div>

      {/* Table */}
      <DataTable<Purchase> columns={columns} data={filteredPurchases} isLoading={isLoading} />
    </div>
  );
}
