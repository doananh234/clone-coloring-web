"use client";
import { useParams } from "next/navigation";
import { ArtStyleDetailPage } from "@/views/art-style-detail-page";
export default function ArtStyleDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <ArtStyleDetailPage artStyleId={id} />;
}
