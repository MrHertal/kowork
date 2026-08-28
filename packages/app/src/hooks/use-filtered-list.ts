// @opencode-ref: opencode/packages/ui/src/hooks/use-filtered-list.tsx
import { entries, groupBy, map, pipe } from "remeda";
import { useCallback, useMemo, useState } from "react";

export interface FilteredGroup<T> {
  category: string;
  items: T[];
}

export interface FilteredListProps<T> {
  items: T[];
  filterKeys?: (keyof T | string)[];
  groupBy?: (item: T) => string;
  sortBy?: (a: T, b: T) => number;
  sortGroupsBy?: (a: FilteredGroup<T>, b: FilteredGroup<T>) => number;
  skipFilter?: (item: T) => boolean;
}

function readPath(item: unknown, path: string): string {
  const parts = path.split(".");
  let value: unknown = item;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return "";
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "string" ? value : "";
}

function matches<T>(
  item: T,
  needle: string,
  keys?: (keyof T | string)[],
): boolean {
  if (!keys || keys.length === 0) {
    if (typeof item === "string") return item.toLowerCase().includes(needle);
    return false;
  }
  for (const key of keys) {
    const value = readPath(item, String(key));
    if (value.toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function useFilteredList<T>({
  items,
  filterKeys,
  groupBy: groupByFn,
  sortBy,
  sortGroupsBy,
  skipFilter,
}: FilteredListProps<T>) {
  const [filter, setFilter] = useState("");

  const groups = useMemo<FilteredGroup<T>[]>(() => {
    const needle = filter.trim().toLowerCase();
    const skipped = needle && skipFilter ? items.filter(skipFilter) : [];
    const filterable = skipFilter
      ? items.filter((item) => !skipFilter(item))
      : items;
    const filtered = needle
      ? [
          ...filterable.filter((item) => matches(item, needle, filterKeys)),
          ...skipped,
        ]
      : items;
    return pipe(
      filtered,
      groupBy((x) => (groupByFn ? groupByFn(x) : "")),
      entries(),
      map(([category, grouped]) => ({
        category,
        items: sortBy ? [...grouped].sort(sortBy) : grouped,
      })),
      (result) => (sortGroupsBy ? [...result].sort(sortGroupsBy) : result),
    );
  }, [filter, items, filterKeys, groupByFn, sortBy, sortGroupsBy, skipFilter]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const clear = useCallback(() => setFilter(""), []);

  return {
    filter,
    setFilter,
    clear,
    groups,
    flat,
    isEmpty: flat.length === 0,
  };
}
