"use client";
import { useParams } from "next/navigation";
import { LocationDetailPage } from "@/views/location-detail-page";
export default function LocationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <LocationDetailPage locationId={id} />;
}
