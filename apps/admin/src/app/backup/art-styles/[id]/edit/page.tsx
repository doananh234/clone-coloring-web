"use client";

import { useParams } from "next/navigation";
import { ArtStyleCreatePage } from "@/views/art-style-create-page";

export default function ArtStyleEditRoute() {
  const { id } = useParams<{ id: string }>();
  return <ArtStyleCreatePage artStyleId={id} />;
}
