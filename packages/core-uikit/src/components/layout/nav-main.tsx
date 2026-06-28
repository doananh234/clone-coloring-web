import { useState, useEffect, useMemo } from "react";
import { Button } from "../ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "../ui/sidebar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCirclePlus, faEnvelope, faChevronRight } from "@fortawesome/pro-regular-svg-icons";

type NavSubItem = {
  title: string;
  url: string;
  icon?: React.ReactNode;
};

type NavItem = {
  title: string;
  url: string;
  icon?: React.ReactNode;
  subItems?: NavSubItem[];
};

type LinkComponent = React.ComponentType<{
  href: string;
  children?: React.ReactNode;
  className?: string;
}>;

type NavMainProps = {
  items: NavItem[];
  LinkComponent?: LinkComponent;
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
      setTimeout(update, 0);
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

function NavItemWithChildren({
  item,
  pathname,
  Link,
}: {
  item: NavItem;
  pathname: string;
  Link: LinkComponent | "a";
}) {
  const subItems = item.subItems ?? [];
  const childActive = useMemo(
    () => subItems.some((sub) => isActive(pathname, sub.url)),
    [subItems, pathname],
  );
  const [open, setOpen] = useState<boolean>(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.title}
        data-active={childActive || undefined}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {item.icon}
        <span>{item.title}</span>
        <FontAwesomeIcon
          icon={faChevronRight}
          className={`ml-auto transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {subItems.map((sub) => (
            <SidebarMenuSubItem key={sub.title}>
              <SidebarMenuSubButton
                isActive={isActive(pathname, sub.url)}
                render={<Link href={sub.url} />}
              >
                {sub.icon}
                <span>{sub.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
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
          {items.map((item) =>
            item.subItems && item.subItems.length > 0 ? (
              <NavItemWithChildren
                key={item.title}
                item={item}
                pathname={pathname}
                Link={Link}
              />
            ) : (
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
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
