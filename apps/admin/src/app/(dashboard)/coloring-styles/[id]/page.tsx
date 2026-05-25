"use client";
import { useParams } from "next/navigation";
import { ColoringStyleDetailPage } from "@/views/coloring-style-detail-page";
export default function ColoringStyleDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <ColoringStyleDetailPage coloringStyleId={id} />;
}
