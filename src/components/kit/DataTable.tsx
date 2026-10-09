import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "./layout";

export type SortDirection = "asc" | "desc";
export type SortValue = string | number | boolean | Date | null | undefined;

export interface DataColumn<T> {
  /** Stable id, used for sorting and keys. Defaults to the column index. */
  id?: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => SortValue;
  /** Classes for both the header and body cells. */
  className?: string;
  headerClassName?: string;
  /** Hide this column in the table below this breakpoint (it still shows on the phone card). */
  hideBelow?: "sm" | "md" | "lg";
  align?: "left" | "center" | "right";
  /** Leave out of the phone card layout (e.g. the actions column when `mobileTitle` already has them). */
  hideOnCard?: boolean;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  onSelectionChange?: (ids: string[], rows: T[]) => void;
  /** Rendered in a bar above the table when rows are selected. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  /** Shown when there are no rows. */
  empty?: ReactNode;
  loading?: boolean;
  initialSort?: { column: string; direction?: SortDirection };
  /** Rows per page. 0 disables pagination. Default 20. */
  pageSize?: number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Phone card: custom title area (defaults to the first column's cell). */
  mobileTitle?: (row: T) => ReactNode;
  className?: string;
  /** Accessible table caption. */
  caption?: string;
}

const hideClass = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;
const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** Enter or Space on a focused clickable row opens it (keys pressed inside its own buttons and links are left alone). */
function activateOnKey(e: KeyboardEvent<HTMLElement>, open: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
}

function compare(a: SortValue, b: SortValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Sortable, selectable, paginated table. Renders a real table from 640px up and a
 * stacked card list on phones, so pages never scroll sideways.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  selectable,
  onSelectionChange,
  bulkActions,
  empty,
  loading,
  initialSort,
  pageSize = 20,
  onRowClick,
  rowClassName,
  mobileTitle,
  className,
  caption,
}: DataTableProps<T>) {
  const cols = useMemo(() => columns.map((c, i) => ({ ...c, id: c.id ?? String(i) })), [columns]);
  const [sort, setSort] = useState<{ column: string; direction: SortDirection } | null>(
    initialSort ? { column: initialSort.column, direction: initialSort.direction ?? "asc" } : null,
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.id === sort.column);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Empty values always last, whatever the direction.
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
      return compare(av, bv) * dir;
    });
  }, [rows, sort, cols]);

  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = pageSize > 0 ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  // Drop selections that are no longer in the data.
  useEffect(() => {
    if (selected.size === 0) return;
    const ids = new Set(rows.map(getRowId));
    const next = new Set([...selected].filter((id) => ids.has(id)));
    if (next.size !== selected.size) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(getRowId(r))), [rows, selected, getRowId]);

  useEffect(() => {
    onSelectionChange?.([...selected], selectedRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const clear = () => setSelected(new Set());
  const pageIds = pageRows.map(getRowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));

  const togglePage = () => {
    const next = new Set(selected);
    if (allOnPage) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  };
  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSort = (id: string) => {
    setPage(0);
    setSort((prev) => {
      if (!prev || prev.column !== id) return { column: id, direction: "asc" };
      if (prev.direction === "asc") return { column: id, direction: "desc" };
      return null;
    });
  };

  const headCell = (col: (typeof cols)[number]) =>
    cn(
      "whitespace-nowrap px-3 py-3 text-[12px] font-medium text-muted-foreground first:pl-5 last:pr-5",
      alignClass[col.align ?? "left"],
      col.hideBelow && hideClass[col.hideBelow],
      col.className,
      col.headerClassName,
    );

  if (loading) {
    // Same header and column widths as the loaded table, so nothing jumps when rows arrive.
    const skeletonRows = Math.min(pageSize > 0 ? pageSize : 8, 8);
    return (
      <div className={cn("min-w-0", className)} aria-busy="true" aria-label="Loading">
        <div className="hidden overflow-hidden sm:block">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {selectable && <th scope="col" className="w-10 px-3 py-2.5" aria-hidden />}
                {cols.map((col) => (
                  <th key={col.id} scope="col" className={headCell(col)}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: skeletonRows }).map((_, r) => (
                <tr key={r} className="border-b border-border/60 last:border-0">
                  {selectable && (
                    <td className="w-10 px-3 py-3.5">
                      <Skeleton className="h-4 w-4 rounded" />
                    </td>
                  )}
                  {cols.map((col, c) => (
                    <td key={col.id} className={cn("px-3 py-3.5 first:pl-4 last:pr-4", col.hideBelow && hideClass[col.hideBelow], col.className)}>
                      <Skeleton
                        className={cn(
                          "h-3.5",
                          c === 0 ? "w-4/5 max-w-[180px]" : col.align === "right" ? "ml-auto w-16" : col.align === "center" ? "mx-auto w-12" : "w-3/5 max-w-[140px]",
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-border/60 sm:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="space-y-2.5 px-4 py-3.5">
              <Skeleton className="h-4 w-1/2" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className={className}>{empty ?? <EmptyState icon={Inbox} title="Nothing here yet" compact />}</div>;
  }

  const [titleCol, ...restCols] = cols;
  const shownOnCard = (mobileTitle ? cols : restCols).filter((c) => !c.hideOnCard);
  // An `id: "actions"` column sits beside the card title on phones (top right), not in the field grid.
  const cardActions = shownOnCard.find((c) => c.id === "actions");
  const cardCols = shownOnCard.filter((c) => c !== cardActions);

  return (
    <div className={cn("min-w-0", className)}>
      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 bg-primary/5 px-3 py-2 sm:px-4">
          <span className="text-xs font-semibold text-primary">{selected.size} selected</span>
          <button type="button" onClick={clear} className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline">
            Clear
          </button>
          {bulkActions && <div className="ml-auto flex flex-wrap items-center gap-2">{bulkActions(selectedRows, clear)}</div>}
        </div>
      )}

      {/* Table: 640px and up */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-[13px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                    onCheckedChange={togglePage}
                    aria-label="Select all rows on this page"
                  />
                </th>
              )}
              {cols.map((col) => {
                const active = sort?.column === col.id;
                const sortable = !!col.sortValue;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                    className={headCell(col)}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                          col.align === "right" && "flex-row-reverse",
                          active && "text-foreground",
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort!.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => {
              const id = getRowId(row);
              const isSelected = selected.has(id);
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => activateOnKey(e, () => onRowClick(row)) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-brand-50/50 dark:hover:bg-muted/40",
                    onRowClick && "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    isSelected && "bg-primary/[0.04]",
                    rowClassName?.(row),
                  )}
                >
                  {selectable && (
                    <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(id)} aria-label="Select row" />
                    </td>
                  )}
                  {cols.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        "px-3 py-3 align-middle text-foreground first:pl-5 last:pr-5",
                        alignClass[col.align ?? "left"],
                        col.align === "right" && "tabular whitespace-nowrap",
                        col.hideBelow && hideClass[col.hideBelow],
                        col.className,
                      )}
                    >
                      {col.cell(row, safePage * pageSize + index)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards: phones */}
      <ul className="divide-y divide-border/60 sm:hidden">
        {pageRows.map((row, index) => {
          const id = getRowId(row);
          const isSelected = selected.has(id);
          const absolute = safePage * pageSize + index;
          return (
            <li
              key={id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => activateOnKey(e, () => onRowClick(row)) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                "px-4 py-3",
                onRowClick && "cursor-pointer active:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                isSelected && "bg-primary/[0.04]",
                rowClassName?.(row),
              )}
            >
              <div className="flex items-start gap-3">
                {selectable && (
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(id)} aria-label="Select row" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1 text-sm font-semibold">{mobileTitle ? mobileTitle(row) : titleCol.cell(row, absolute)}</div>
                    {cardActions && (
                      <div className="-mr-2 -mt-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {cardActions.cell(row, absolute)}
                      </div>
                    )}
                  </div>
                  {cardCols.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {cardCols.map((col) => (
                        <div key={col.id} className={cn("min-w-0", (col.header === "" || col.header == null) && "col-span-2")}>
                          {col.header !== "" && col.header != null && (
                            <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{col.header}</dt>
                          )}
                          <dd className="min-w-0 break-words text-[13px] text-foreground">{col.cell(row, absolute)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pageSize > 0 && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
          <p className="tabular text-xs text-muted-foreground">
            {safePage * pageSize + 1}–{Math.min(sorted.length, (safePage + 1) * pageSize)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg sm:h-8 sm:w-8"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs font-medium tabular">
              {safePage + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg sm:h-8 sm:w-8"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
