"use client";

import { HubScreen, type HubCard } from "./hub-screen";
import { COLORING_BASE as B } from "../../components/shell/nav-config";

const CARDS: HubCard[] = [
  { icon: "folder", title: "Danh mục", sub: "Map Etsy taxonomy", href: `${B}/library/categories` },
  { icon: "tag", title: "Brand", sub: "Gắn Etsy shop", href: `${B}/library/brands` },
  { icon: "users", title: "Nhân vật", sub: "Extract từ clone job", href: `${B}/library/characters` },
  { icon: "map-pin", title: "Bối cảnh", sub: "Location context", href: `${B}/library/locations` },
];

export function LibraryScreen() {
  return <HubScreen title="Thư viện" subtitle="Tài nguyên dùng chung cho mọi clone job và book" cards={CARDS} />;
}
