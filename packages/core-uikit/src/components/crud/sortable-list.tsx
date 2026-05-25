import React, { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical } from "@fortawesome/pro-regular-svg-icons";

/** Minimum shape required for sortable items. */
type SortableItemData = { id: string };

type SortableListProps<T extends SortableItemData> = {
  /** Array of items to render. Each must have a unique `id`. */
  items: T[];
  /** Called with the reordered array after a drag completes. */
  onReorder: (items: T[]) => void;
  /** Render function for each item. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Optional className for the list container. */
  className?: string;
};

/** Internal wrapper that makes a single item draggable. */
function SortableItem<T extends SortableItemData>({
  item,
  index,
  renderItem,
}: {
  item: T;
  index: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-background p-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <FontAwesomeIcon icon={faGripVertical} className="size-4" />
      </button>
      <div className="flex-1 min-w-0">{renderItem(item, index)}</div>
    </div>
  );
}

/**
 * Generic drag-and-drop reorderable list using @dnd-kit.
 *
 * Provides a vertical sortable list with drag handles.
 */
export function SortableList<T extends SortableItemData>({
  items,
  onReorder,
  renderItem,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      onReorder(arrayMove(items, oldIndex, newIndex));
    },
    [items, onReorder],
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className ?? "flex flex-col gap-2"}>
          {items.map((item, index) => (
            <SortableItem key={item.id} item={item} index={index} renderItem={renderItem} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
