"use client";

import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "../../components/ui/badge";
import { Icon } from "../../lib/icon";
import { thumbImg, resolveImg } from "../../data/img";
import { QUEUE_COLUMNS, type QueueStatus } from "../../data/use-queue-status";
import type { BookRow } from "../../data/types";

function statusOf(b: BookRow): QueueStatus {
  const s = b.queueStatus;
  return s === "in_progress" || s === "review" || s === "done" ? s : "todo";
}

function Card({ book, assignee, onOpen }: { book: BookRow; assignee?: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: book.id });
  const [copied, setCopied] = useState(false);
  const cover = thumbImg(book.coverUrl || book.squareThumbnailUrl || book.thumbnailUrl, 400);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={{
        position: "relative",
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 10,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "var(--neutral-100)", border: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : <Icon name="image" size={16} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.title}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
          {book.niche && <Badge tone="info">{book.niche}</Badge>}
          {assignee && <Badge tone="carbon">◍ {assignee}</Badge>}
        </div>
      </div>
      {book.exportUrl && (
        <button
          type="button"
          // Stop the pointer-down from reaching the card's drag listeners, and
          // the click from reaching the card's onClick (which opens the book).
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const full = resolveImg(book.exportUrl);
            if (!full || !navigator.clipboard) return;
            navigator.clipboard
              .writeText(full)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              })
              .catch(() => {});
          }}
          title="Copy link ZIP"
          aria-label="Copy link ZIP"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--background)",
            cursor: "pointer",
            color: copied ? "var(--success)" : "var(--muted-foreground)",
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={13} />
        </button>
      )}
    </div>
  );
}

const COLUMN_INITIAL = 20;
const COLUMN_STEP = 20;

function Column({ col, books, assigneeName, onOpen, surfaceId }: { col: { key: QueueStatus; label: string }; books: BookRow[]; assigneeName: (b: BookRow) => string | undefined; onOpen: (id: string) => void; surfaceId?: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  // Only mount the first N cards per column so a large queue doesn't put
  // hundreds of card nodes in the DOM at once; reveal more on demand.
  const [visible, setVisible] = useState(COLUMN_INITIAL);
  // Surface a just-dropped card at the top of its new column so it stays visible
  // even when the column already has ≥N cards shown (otherwise it lands past the
  // render cap and looks "lost" until "Hiện thêm").
  const ordered =
    surfaceId && books.some((b) => b.id === surfaceId)
      ? [books.find((b) => b.id === surfaceId)!, ...books.filter((b) => b.id !== surfaceId)]
      : books;
  const shown = ordered.slice(0, visible);
  const remaining = ordered.length - shown.length;
  return (
    <div style={{ flex: "1 1 240px", minWidth: 240, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted-foreground)" }}>
        {col.label} <Badge tone="neutral">{books.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 120, padding: 8, borderRadius: "var(--radius-md)", background: isOver ? "var(--neutral-100)" : "transparent", border: `1px dashed ${isOver ? "var(--volt-600)" : "var(--border)"}` }}
      >
        {shown.map((b) => <Card key={b.id} book={b} assignee={assigneeName(b)} onOpen={() => onOpen(b.id)} />)}
        {books.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", padding: "16px 0" }}>Trống</div>}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + COLUMN_STEP)}
            style={{ marginTop: 4, padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", background: "transparent", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
          >
            Hiện thêm {Math.min(remaining, COLUMN_STEP)} (còn {remaining})
          </button>
        )}
      </div>
    </div>
  );
}

/** Kanban board: books grouped by queueStatus; drag a card to another column to change status. */
export function QueueKanban({ books, onMove, assigneeName, onOpen }: {
  books: BookRow[];
  onMove: (bookId: string, status: QueueStatus) => void;
  assigneeName: (b: BookRow) => string | undefined;
  onOpen: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // Id of the last card moved between columns — surfaced at the top of its new
  // column so the render cap never hides a fresh drop.
  const [movedId, setMovedId] = useState<string | null>(null);

  const onDragEnd = (e: DragEndEvent) => {
    const bookId = String(e.active.id);
    const target = e.over?.id ? (String(e.over.id) as QueueStatus) : null;
    if (!target) return;
    const book = books.find((b) => b.id === bookId);
    if (book && statusOf(book) !== target) {
      setMovedId(bookId);
      onMove(bookId, target);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        {QUEUE_COLUMNS.map((col) => (
          <Column
            key={col.key}
            col={col}
            books={books.filter((b) => statusOf(b) === col.key)}
            assigneeName={assigneeName}
            onOpen={onOpen}
            surfaceId={movedId}
          />
        ))}
      </div>
    </DndContext>
  );
}
