import * as React from "react";
import { useRestGetAll } from "../../api/hooks/use-rest-api";
import { useActiveBrandStore } from "../../store/active-brand-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faCheck, faChevronDown, faGear } from "@fortawesome/pro-regular-svg-icons";

type BrandRecord = {
  id: string;
  name: string;
  displayName?: string | null;
  logoUrl?: string | null;
};

const brandLabel = (b: BrandRecord): string => b.displayName?.trim() || b.name;

type BrandSwitcherProps = {
  LinkComponent?: React.ComponentType<{
    href: string;
    children?: React.ReactNode;
    className?: string;
  }>;
};

export function BrandSwitcher({ LinkComponent }: BrandSwitcherProps) {
  const { isMobile } = useSidebar();
  const { activeBrand, setActiveBrand } = useActiveBrandStore();
  const { data: brands, isLoading } = useRestGetAll<BrandRecord>({
    entityName: "brands",
    url: "/api/brands",
    limit: 100,
  });

  // Auto-select the first brand when none is active, or when the persisted
  // active brand no longer exists in the list.
  React.useEffect(() => {
    if (isLoading || brands.length === 0) return;
    const stillExists = activeBrand && brands.some((b) => b.id === activeBrand.id);
    if (!stillExists) {
      const first = brands[0];
      setActiveBrand({ id: first.id, name: brandLabel(first) });
    }
  }, [isLoading, brands, activeBrand, setActiveBrand]);

  const manageHref = "/brands";
  const Link = LinkComponent || "a";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FontAwesomeIcon icon={faTag} className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">
                {activeBrand?.name ?? (isLoading ? "Loading…" : "Select brand")}
              </span>
              <span className="truncate text-xs text-foreground/70">Brand workspace</span>
            </div>
            <FontAwesomeIcon icon={faChevronDown} className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Brands
            </DropdownMenuLabel>
            {brands.length === 0 && (
              <DropdownMenuItem disabled>
                {isLoading ? "Loading…" : "No brands yet"}
              </DropdownMenuItem>
            )}
            {brands.map((b) => {
              const label = brandLabel(b);
              const isActive = activeBrand?.id === b.id;
              return (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => setActiveBrand({ id: b.id, name: label })}
                >
                  <FontAwesomeIcon icon={faTag} className="size-4" />
                  <span className="truncate">{label}</span>
                  {isActive && <FontAwesomeIcon icon={faCheck} className="ml-auto size-4" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={manageHref} />}>
              <FontAwesomeIcon icon={faGear} className="size-4" />
              Manage brands
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
