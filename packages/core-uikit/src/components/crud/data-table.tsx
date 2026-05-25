import React from "react";
import { useTranslation } from "react-i18next";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faAnglesLeft,
  faAnglesRight,
  faSort,
  faArrowUp,
  faArrowDown,
} from "@fortawesome/pro-regular-svg-icons";
import type { PaginationMeta, SortParam } from "../../types";

type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  meta?: PaginationMeta;
  isLoading?: boolean;
  initialSort?: SortParam[];
  onPageChange?: (page: number) => void;
  onSortChange?: (sort: SortParam[]) => void;
};

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") {
    return <FontAwesomeIcon icon={faArrowUp} className="ml-1.5 h-3.5 w-3.5 text-foreground" />;
  }
  if (sorted === "desc") {
    return <FontAwesomeIcon icon={faArrowDown} className="ml-1.5 h-3.5 w-3.5 text-foreground" />;
  }
  return <FontAwesomeIcon icon={faSort} className="ml-1.5 h-3.5 w-3.5 opacity-40" />;
}

function DataTableInner<T>({
  columns,
  data,
  meta,
  isLoading,
  initialSort,
  onPageChange,
  onSortChange,
}: DataTableProps<T>) {
  const { t } = useTranslation("common");
  const [sorting, setSorting] = React.useState<SortingState>(
    () => initialSort?.map((s) => ({ id: s.field, desc: s.order === "desc" })) ?? [],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      if (onSortChange) {
        onSortChange(
          newSorting.map((s) => ({
            field: s.id,
            order: s.desc ? ("desc" as const) : ("asc" as const),
          })),
        );
      }
    },
    state: { sorting },
    manualSorting: !!onSortChange,
  });

  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div ref={tableContainerRef} className="rounded-md border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 font-medium"
                        onClick={() => header.column.toggleSorting()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon sorted={header.column.getIsSorted()} />
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t("noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            {t("page")} {meta.page} {t("of")} {meta.totalPages} ({meta.total} {t("total")})
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(1)}
              disabled={meta.page <= 1}
            >
              <FontAwesomeIcon icon={faAnglesLeft} className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(meta.page - 1)}
              disabled={meta.page <= 1}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
            >
              <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(meta.totalPages)}
              disabled={meta.page >= meta.totalPages}
            >
              <FontAwesomeIcon icon={faAnglesRight} className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {meta && (
        <p className="text-xs text-muted-foreground">
          {meta.total} {t("total")}
        </p>
      )}
    </div>
  );
}

export const DataTable = React.memo(DataTableInner) as typeof DataTableInner;
