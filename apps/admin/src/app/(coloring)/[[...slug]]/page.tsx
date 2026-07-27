import { ColoringApp } from "@vx/coloring/screens";

export default async function ColoringCatchAllPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const slug = (await params).slug ?? [];
  return <ColoringApp slug={slug} />;
}
