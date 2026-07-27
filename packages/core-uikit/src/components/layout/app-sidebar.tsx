import * as React from "react";

import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import { BrandSwitcher } from "./brand-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "../ui/sidebar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faFolder,
  faHouse,
  faUser,
  faMapPin,
  faWallet,
  faReceipt,
  faGear,
  faCircleQuestion,
  faMagnifyingGlass,
  faPalette,
  faDroplet,
  faCopy,
  faTag,
} from "@fortawesome/pro-regular-svg-icons";

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    { title: "Books", url: "/backup/books", icon: <FontAwesomeIcon icon={faBookOpen} /> },
    { title: "Clone Book", url: "/backup/clone", icon: <FontAwesomeIcon icon={faCopy} /> },
    {
      title: "Settings",
      url: "#",
      icon: <FontAwesomeIcon icon={faGear} />,
      subItems: [
        { title: "Categories", url: "/backup/categories", icon: <FontAwesomeIcon icon={faFolder} /> },
        { title: "Brands", url: "/backup/brands", icon: <FontAwesomeIcon icon={faTag} /> },
        { title: "Characters", url: "/backup/characters", icon: <FontAwesomeIcon icon={faUser} /> },
        { title: "Locations", url: "/backup/locations", icon: <FontAwesomeIcon icon={faMapPin} /> },
        { title: "Art Styles", url: "/backup/art-styles", icon: <FontAwesomeIcon icon={faPalette} /> },
        { title: "Coloring Styles", url: "/backup/coloring-styles", icon: <FontAwesomeIcon icon={faDroplet} /> },
        { title: "App Home", url: "/backup/app-home", icon: <FontAwesomeIcon icon={faHouse} /> },
        { title: "Wallets", url: "/backup/wallets", icon: <FontAwesomeIcon icon={faWallet} /> },
        { title: "Credit Ledger", url: "/backup/credit-ledger", icon: <FontAwesomeIcon icon={faReceipt} /> },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Get Help",
      url: "#",
      icon: <FontAwesomeIcon icon={faCircleQuestion} />,
    },
    {
      title: "Search",
      url: "#",
      icon: <FontAwesomeIcon icon={faMagnifyingGlass} />,
    },
  ],
};
type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  LinkComponent?: React.ComponentType<{
    href: string;
    children?: React.ReactNode;
    className?: string;
  }>;
  /** Override default user data for nav footer */
  user?: { name: string; email: string; avatar: string };
  /** Logout handler — passed to NavUser */
  onLogout?: () => void;
};

export function AppSidebar({ LinkComponent, user, onLogout, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <BrandSwitcher LinkComponent={LinkComponent} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} LinkComponent={LinkComponent} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser user={user || data.user} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  );
}
