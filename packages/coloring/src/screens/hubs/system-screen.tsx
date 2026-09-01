"use client";

import { HubScreen, type HubCard } from "./hub-screen";
import { COLORING_BASE as B } from "../../components/shell/nav-config";

const CARDS: HubCard[] = [
  { icon: "store", title: "Etsy listings", sub: "Đang bán · sync", href: `${B}/etsy` },
  { icon: "wallet", title: "Chi phí AI & logs", sub: "Ngân sách generation", href: `${B}/system/ai-cost` },
  { icon: "settings", title: "Cài đặt hệ thống", sub: "Model AI, ngân sách, Etsy, PDF", href: `${B}/system/settings` },
];

export function SystemScreen() {
  return <HubScreen title="Kênh bán & hệ thống" subtitle="Etsy, chi phí AI và quản trị người dùng" cards={CARDS} maxWidth={660} />;
}
