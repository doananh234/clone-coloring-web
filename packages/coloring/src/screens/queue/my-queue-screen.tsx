"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../components/ui/card";
import { Select } from "../../components/ui/form-controls";
import { LoadingRows, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useBooks } from "../../data/use-books";
import { useOperators } from "../../data/use-book-assign";
import { useSetQueueStatus, type QueueStatus } from "../../data/use-queue-status";
import { useColoringAuth } from "../../hooks/coloring-auth";
import { applyBookPatch } from "../../data/local-books";
import { QueueKanban } from "./queue-kanban";
import type { BookRow } from "../../data/types";

export function MyQueueScreen() {
  const router = useRouter();
  const { user } = useColoringAuth();
  const isAdmin = user?.role === "admin";
  const operators = useOperators(isAdmin);
  const [assignee, setAssignee] = useState(""); // admin person filter (operator id); "" = all
  // Members: only books assigned to them. Admins: all assigned books, filtered client-side by person.
  const { books, isLoading, isError } = useBooks(1, 200, { assign: isAdmin ? "assigned" : "mine" });
  const setStatus = useSetQueueStatus();
  const [override, setOverride] = useState<Record<string, QueueStatus>>({});
  const [err, setErr] = useState<string | null>(null);

  const opName = useMemo(() => new Map(operators.map((o) => [o.id, o.name || o.username])), [operators]);
  const rows = useMemo(() => {
    let list = books.map(applyBookPatch);
    if (isAdmin && assignee) list = list.filter((b) => b.assignedToId === assignee);
    return list.map((b) => (override[b.id] ? { ...b, queueStatus: override[b.id] } : b));
  }, [books, isAdmin, assignee, override]);

  const assigneeName = (b: BookRow): string | undefined =>
    isAdmin && b.assignedToId ? opName.get(b.assignedToId) || b.assignedToId.slice(0, 6) : undefined;

  const onMove = async (bookId: string, status: QueueStatus) => {
    setOverride((p) => ({ ...p, [bookId]: status }));
    setErr(null);
    try {
      await setStatus(bookId, status);
    } catch (e) {
      setOverride((p) => { const n = { ...p }; delete n[bookId]; return n; });
      setErr(e instanceof Error ? e.message : "Đổi trạng thái thất bại");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Hàng đợi của tôi</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
            {isLoading ? "Đang tải…" : `${rows.length} sách · kéo thẻ để đổi trạng thái`}
          </p>
        </div>
        {isAdmin && (
          <div style={{ width: 220 }}>
            <Select value={assignee} onChange={setAssignee} options={[{ label: "Tất cả người nhận", value: "" }, ...operators.map((o) => ({ label: o.name || o.username, value: o.id }))]} />
          </div>
        )}
      </div>

      {err && <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "var(--danger-bg)", color: "var(--danger)" }}>{err}</div>}

      {isLoading ? (
        <Card><LoadingRows rows={4} height={80} /></Card>
      ) : isError ? (
        <Card><ErrorState sub="Không tải được hàng đợi." /></Card>
      ) : (
        <QueueKanban books={rows} onMove={onMove} assigneeName={assigneeName} onOpen={(id) => router.push(`${B}/books/${id}`)} />
      )}
    </div>
  );
}
