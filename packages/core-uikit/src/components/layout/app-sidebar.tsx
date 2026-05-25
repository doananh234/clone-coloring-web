import * as React from "react";

import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
  faCommand,
  faPalette,
  faDroplet,
  faCopy,
} from "@fortawesome/pro-regular-svg-icons";

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    { title: "Books", url: "/books", icon: <FontAwesomeIcon icon={faBookOpen} /> },
    { title: "Categories", url: "/categories", icon: <FontAwesomeIcon icon={faFolder} /> },
    { title: "Characters", url: "/characters", icon: <FontAwesomeIcon icon={faUser} /> },
    { title: "Locations", url: "/locations", icon: <FontAwesomeIcon icon={faMapPin} /> },
    { title: "Art Styles", url: "/art-styles", icon: <FontAwesomeIcon icon={faPalette} /> },
    {
      title: "Coloring Styles",
      url: "/coloring-styles",
      icon: <FontAwesomeIcon icon={faDroplet} />,
    },
    { title: "Clone", url: "/clone", icon: <FontAwesomeIcon icon={faCopy} /> },
    { title: "App Home", url: "/app-home", icon: <FontAwesomeIcon icon={faHouse} /> },
    { title: "Wallets", url: "/wallets", icon: <FontAwesomeIcon icon={faWallet} /> },
    { title: "Credit Ledger", url: "/credit-ledger", icon: <FontAwesomeIcon icon={faReceipt} /> },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: <FontAwesomeIcon icon={faGear} />,
    },
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="/" />}
            >
              <FontAwesomeIcon icon={faCommand} className="size-5!" />
              <span className="text-base font-semibold">Acme Inc.</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
