"use client";

import { useRouter } from "next/navigation";
import { Card } from "../../components/ui/card";
import { EntityGrid, type EntityTile } from "../../components/ui/entity-grid";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useEntityList } from "../../data/use-entity-list";
import type { EntityListItem } from "../../data/types";

export interface EntitySectionProps {
  title: string;
  /** Endpoint path below the API base, e.g. "characters", "art-styles". */
  path: string;
  /** Kind key for detail routing (/coloring/entity/{kind}/{id}). Defaults to path. */
  kind?: string;
  toTile: (raw: EntityListItem) => EntityTile;
  ratio?: "1 / 1" | "3 / 4";
  emptyText?: string;
}

export function EntitySection({ title, path, kind, toTile, ratio = "1 / 1", emptyText }: EntitySectionProps) {
  const router = useRouter();
  const { items, total, isLoading, isError } = useEntityList(path);
  const openDetail = (id: string) => router.push(`${B}/entity/${kind ?? path}/${id}`);

  return (
    <Card title={isLoading ? title : `${title} · ${total}`}>
      {isLoading ? (
        <LoadingRows rows={2} height={110} />
      ) : isError ? (
        <ErrorState sub={`Không gọi được /${path}.`} />
      ) : items.length === 0 ? (
        <EmptyState title="Chưa có dữ liệu" sub={emptyText} />
      ) : (
        <EntityGrid tiles={items.map(toTile)} ratio={ratio} onOpen={openDetail} />
      )}
    </Card>
  );
}
