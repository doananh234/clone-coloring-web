import {
  IconLayoutDashboard,
  IconCopy,
  IconBook,
  IconPencil,
  IconFolder,
  IconPalette,
  IconSettings,
  IconBell,
  IconPlus,
  IconMenu2,
  IconSun,
  IconMoon,
  IconUser,
  IconLogout,
  IconPhoto,
  IconWallet,
  IconBuildingStore,
  IconAlertTriangle,
  IconChevronRight,
  IconChevronDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconSearch,
  IconX,
  IconArrowLeft,
  IconCheck,
  IconClock,
  IconFileText,
  IconDownload,
  IconLayoutGrid,
  IconChevronRight as IconCrumbSep,
  IconTag,
  IconUsers,
  IconMapPin,
  IconWand,
  IconSparkles,
  IconShield,
  IconStack2,
  IconUpload,
  IconLoader2,
  IconEye,
  IconEyeOff,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  type IconProps as TablerIconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

/** Design icon name → Tabler component. Tabler mirrors Lucide's 1.8-stroke line aesthetic. */
const REGISTRY: Record<string, ComponentType<TablerIconProps>> = {
  "layout-dashboard": IconLayoutDashboard,
  copy: IconCopy,
  "book-open": IconBook,
  "pen-line": IconPencil,
  folder: IconFolder,
  palette: IconPalette,
  settings: IconSettings,
  bell: IconBell,
  plus: IconPlus,
  menu: IconMenu2,
  sun: IconSun,
  moon: IconMoon,
  user: IconUser,
  "log-out": IconLogout,
  image: IconPhoto,
  wallet: IconWallet,
  store: IconBuildingStore,
  "alert-triangle": IconAlertTriangle,
  "chevron-right": IconChevronRight,
  "chevron-down": IconChevronDown,
  "chevrons-left": IconChevronsLeft,
  "chevrons-right": IconChevronsRight,
  search: IconSearch,
  x: IconX,
  "arrow-left": IconArrowLeft,
  check: IconCheck,
  clock: IconClock,
  "file-text": IconFileText,
  download: IconDownload,
  "layout-grid": IconLayoutGrid,
  "crumb-sep": IconCrumbSep,
  tag: IconTag,
  users: IconUsers,
  "map-pin": IconMapPin,
  wand: IconWand,
  sparkles: IconSparkles,
  shield: IconShield,
  layers: IconStack2,
  upload: IconUpload,
  loader: IconLoader2,
  eye: IconEye,
  "eye-off": IconEyeOff,
  "align-left": IconAlignLeft,
  "align-center": IconAlignCenter,
  "align-right": IconAlignRight,
};

export type IconName = keyof typeof REGISTRY | (string & {});

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
  className?: string;
}

export function Icon({ name, size = 18, stroke = 1.8, color = "currentColor", className }: IconProps) {
  const Cmp = REGISTRY[name];
  if (!Cmp) return null;
  return <Cmp size={size} stroke={stroke} color={color} className={className} />;
}
