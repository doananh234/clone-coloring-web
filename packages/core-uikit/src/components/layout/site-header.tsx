import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSun, faMoon } from "@fortawesome/pro-regular-svg-icons";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";
import { NotificationBell } from "./notification-bell";
import { useTheme } from "../../hooks/use-theme";

function getPageTitle(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : "Dashboard";
}

function usePathname(): string {
  const [pathname, setPathname] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  );
  useEffect(() => {
    function onPopState() {
      setPathname(window.location.pathname);
    }
    window.addEventListener("popstate", onPopState);
    // Also watch for pushState via Next.js navigation
    const origPush = window.history.pushState.bind(window.history);
    window.history.pushState = (...args: Parameters<typeof origPush>) => {
      origPush(...args);
      setTimeout(() => setPathname(window.location.pathname), 0);
    };
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = origPush;
    };
  }, []);
  return pathname;
}

export function SiteHeader() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1.5 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="text-sm font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? (
              <FontAwesomeIcon icon={faSun} className="h-4 w-4" />
            ) : (
              <FontAwesomeIcon icon={faMoon} className="h-4 w-4" />
            )}
          </Button>
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
