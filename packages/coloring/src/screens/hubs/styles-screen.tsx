"use client";

import { HubScreen, type HubCard } from "./hub-screen";
import { COLORING_BASE as B } from "../../components/shell/nav-config";

const CARDS: HubCard[] = [
  { icon: "pen-line", title: "B&W style", sub: "Style nét line-art", href: `${B}/styles/bwstyles` },
  { icon: "palette", title: "Coloring style", sub: "Bảng màu & chất liệu", href: `${B}/styles/colorstyles` },
  { icon: "wand", title: "Tạo B&W từ ảnh", sub: "Analyze ảnh → style mới", href: `${B}/styles/extractbw` },
  { icon: "sparkles", title: "Tạo coloring từ ảnh", sub: "Extract palette & directive", href: `${B}/styles/extractcolor` },
];

export function StylesScreen() {
  return <HubScreen title="Phong cách" subtitle="B&W style cho redesign · coloring style cho tô màu AI" cards={CARDS} />;
}
