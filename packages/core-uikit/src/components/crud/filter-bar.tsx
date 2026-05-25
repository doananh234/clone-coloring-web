import React, { useState, useRef, useEffect } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faXmark,
  faSliders,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/pro-regular-svg-icons";

type FilterOption = {
  name: string;
  label: string;
  options: { label: string; value: string }[];
};

function AnimatedPanel({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(expanded ? "auto" : "0px");
  const [overflow, setOverflow] = useState(expanded ? "visible" : "hidden");

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (expanded) {
      // Measure content height, animate to it, then set auto
      const contentHeight = el.scrollHeight;
      setOverflow("hidden");
      setHeight(`${contentHeight}px`);
      const timer = setTimeout(() => {
        setHeight("auto");
        setOverflow("visible");
      }, 200);
      return () => clearTimeout(timer);
    } else {
      // Animate from current height to 0
      const contentHeight = el.scrollHeight;
      setHeight(`${contentHeight}px`);
      setOverflow("hidden");
      // Force reflow, then set to 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight("0px");
        });
      });
    }
  }, [expanded]);

  return (
    <div
      ref={contentRef}
      style={{ height, overflow }}
      className="transition-[height] duration-200 ease-in-out"
    >
      {children}
    </div>
  );
}

type FilterBarProps = {
  searchPlaceholder?: string;
  filters?: FilterOption[];
  defaultSearch?: string;
  defaultFilters?: Record<string, string>;
  onSearch?: (value: string) => void;
  onFilterChange?: (filters: Record<string, string>) => void;
};

export function FilterBar({
  searchPlaceholder = "Search...",
  filters = [],
  defaultSearch = "",
  defaultFilters = {},
  onSearch,
  onFilterChange,
}: FilterBarProps) {
  const [searchValue, setSearchValue] = useState(defaultSearch);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(defaultFilters);
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand if there are active filters on mount
    return Object.values(defaultFilters).some(Boolean);
  });

  function handleSearchChange(value: string) {
    setSearchValue(value);
    onSearch?.(value);
  }

  function handleFilterChange(name: string, value: string) {
    const updated = { ...filterValues, [name]: value };
    setFilterValues(updated);
    onFilterChange?.(updated);
  }

  function handleClearFilters() {
    setFilterValues({});
    onFilterChange?.({});
  }

  function handleClearAll() {
    setSearchValue("");
    setFilterValues({});
    onSearch?.("");
    onFilterChange?.({});
    setExpanded(false);
  }

  const activeFilterCount = Object.values(filterValues).filter(Boolean).length;
  const hasActiveFilters = !!searchValue || activeFilterCount > 0;

  return (
    <div className="space-y-2">
      {/* Search row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
          {searchValue && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {filters.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setExpanded(!expanded)}
          >
            <FontAwesomeIcon icon={faSliders} className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
            {expanded ? (
              <FontAwesomeIcon icon={faChevronUp} className="h-3.5 w-3.5 ml-0.5" />
            ) : (
              <FontAwesomeIcon icon={faChevronDown} className="h-3.5 w-3.5 ml-0.5" />
            )}
          </Button>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearAll}>
            <FontAwesomeIcon icon={faXmark} className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Expandable filter panel with slide animation */}
      {filters.length > 0 && (
        <AnimatedPanel expanded={expanded}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Filters</p>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleClearFilters}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filters.map((filter) => (
                  <div key={filter.name} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {filter.label}
                    </label>
                    <Select
                      value={filterValues[filter.name] || ""}
                      onValueChange={(val) => handleFilterChange(filter.name, val ?? "")}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={`All`} />
                      </SelectTrigger>
                      <SelectContent>
                        {filter.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </AnimatedPanel>
      )}

      {/* Active filter badges */}
      {activeFilterCount > 0 && !expanded && (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((filter) => {
            const val = filterValues[filter.name];
            if (!val) return null;
            const option = filter.options.find((o) => o.value === val);
            return (
              <Badge key={filter.name} variant="secondary" className="gap-1 pr-1">
                {filter.label}: {option?.label ?? val}
                <button
                  onClick={() => handleFilterChange(filter.name, "")}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
