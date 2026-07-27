import { Suspense } from "react";
import { ColoringApp } from "@vx/coloring/screens";

export default async function ColoringCatchAllPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const slug = (await params).slug ?? [];
  // Suspense boundary required because screens read useSearchParams (URL-backed
  // pagination/tab/filter state).
  return (
    <Suspense>
      <ColoringApp slug={slug} />
    </Suspense>
  );
}
