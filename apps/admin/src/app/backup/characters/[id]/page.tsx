"use client";
import { useParams } from "next/navigation";
import { CharacterDetailPage } from "@/views/character-detail-page";
export default function CharacterDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <CharacterDetailPage characterId={id} />;
}
