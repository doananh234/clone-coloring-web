import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCirclePlus, faEnvelope } from "@fortawesome/pro-regular-svg-icons";

type NavItem = {
  title: string;
  url: string;
  icon?: React.ReactNode;
};

type NavMainProps = {
  items: NavItem[];
  LinkComponent?: React.ComponentType<{
    href: string;
    children?: React.ReactNode;
    className?: string;
  }>;
};

function usePathname(): string {
  const [pathname, setPathname] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  );
  useEffect(() => {
    function update() {
      setPathname(window.location.pathname);
    }
    window.addEventListener("popstate", update);
    const origPush = window.history.pushState.bind(window.history);
    window.history.pushState = (...args: Parameters<typeof origPush>) => {
      origPush(...args);
      update();
    };
    return () => {
      window.removeEventListener("popstate", update);
      window.history.pushState = origPush;
    };
  }, []);
  return pathname;
}

function isActive(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(url + "/");
}

export function NavMain({ items, LinkComponent }: NavMainProps) {
  const Link = LinkComponent || "a";
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <FontAwesomeIcon icon={faCirclePlus} />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <FontAwesomeIcon icon={faEnvelope} />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                data-active={isActive(pathname, item.url) || undefined}
                render={<Link href={item.url} />}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
