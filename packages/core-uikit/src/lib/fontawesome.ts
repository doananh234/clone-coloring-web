/**
 * Font Awesome Pro setup and icon re-exports.
 *
 * Centralizes FA configuration and provides a single import point
 * for all icons used across the project. Components should import
 * icons from this module rather than directly from @fortawesome packages.
 */

import "@fortawesome/fontawesome-svg-core/styles.css";
import { config } from "@fortawesome/fontawesome-svg-core";

// Prevent FA from dynamically inserting <style> tags (we import CSS above)
config.autoAddCss = false;

// Re-export the React component and its props type
export { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
export type { FontAwesomeIconProps } from "@fortawesome/react-fontawesome";

// ---------------------------------------------------------------------------
// Pro Regular icons (default weight used throughout the UI)
// ---------------------------------------------------------------------------
export {
  // Navigation / Arrows
  faArrowLeft,
  faArrowUp,
  faArrowDown,
  faArrowsUpDown,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faSort,
  faAnglesLeft,
  faAnglesRight,

  // Actions
  faCheck,
  faCheckDouble,
  faPlus,
  faXmark,
  faTrash,
  faPencil,
  faPenToSquare,
  faEye,
  faCopy,
  faShare,
  faUpload,
  faCloudArrowUp,
  faFloppyDisk,
  faRotate,

  // UI Controls
  faEllipsis,
  faEllipsisVertical,
  faMagnifyingGlass,
  faGripVertical,
  faSliders,
  faFilter,

  // Status / Alerts
  faCircleCheck,
  faCircleInfo,
  faCircleXmark,
  faCircleExclamation,
  faTriangleExclamation,
  faSpinner,
  faArrowTrendUp,
  faArrowTrendDown,

  // Objects / Concepts
  faBell,
  faBookOpen,
  faFolder,
  faFolderOpen,
  faHouse,
  faUser,
  faUsers,
  faCircleUser,
  faMapPin,
  faWallet,
  faReceipt,
  faGear,
  faCircleQuestion,
  faCirclePlus,
  faEnvelope,
  faCreditCard,
  faRightFromBracket,
  faSun,
  faMoon,
  faImage,
  faImages,
  faFilePdf,
  faFileLines,
  faSparkles,
  faWandMagicSparkles,
  faArrowUpRightFromSquare,
  faCommand,

  // Sidebar / Menu
  faBars,
  faBarsStaggered,
  faSidebarFlip,
} from "@fortawesome/pro-regular-svg-icons";

// ---------------------------------------------------------------------------
// Pro Solid icons (for filled / active / emphasis states)
// ---------------------------------------------------------------------------
export {
  faCheck as faCheckSolid,
  faCircleCheck as faCircleCheckSolid,
} from "@fortawesome/pro-solid-svg-icons";
