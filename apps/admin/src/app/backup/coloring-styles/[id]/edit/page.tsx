"use client";

import { useParams } from "next/navigation";
import { ColoringStyleCreatePage } from "@/views/coloring-style-create-page";

export default function ColoringStyleEditRoute() {
  const { id } = useParams<{ id: string }>();
  return <ColoringStyleCreatePage coloringStyleId={id} />;
}
