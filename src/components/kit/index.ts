/*
 * AdiCorp UI kit. Import everything from "@/components/kit".
 */
export { PageHeader, SectionCard, StatTile, StatGrid, EmptyState } from "./layout";
export type { PageHeaderProps, SectionCardProps, StatTileProps, StatGridProps, EmptyStateProps, Tone } from "./layout";

export { DataTable } from "./DataTable";
export type { DataColumn, DataTableProps, SortDirection, SortValue } from "./DataTable";

export { FilterBar, useDebouncedValue } from "./FilterBar";
export type { FilterBarProps } from "./FilterBar";

export { StatusBadge, statusTone } from "./StatusBadge";
export type { StatusBadgeProps, BadgeTone } from "./StatusBadge";

export { CHART_SERIES, CHART_OTHER, CHART_CHROME, STATUS_COLORS, chartColor, chartConfig, statusColor } from "./charts";

export { ConfirmButton, ConfirmDialog } from "./ConfirmButton";
export type { ConfirmButtonProps, ConfirmDialogProps } from "./ConfirmButton";

export { RowActions } from "./RowActions";
export type { RowAction, RowActionsProps } from "./RowActions";

export { default as MonthPicker } from "@/components/common/MonthSelector";

export { Money, useMoney, useCompany, formatMoney } from "./money";
export type { MoneyProps, MoneyFormatOptions } from "./money";

export {
  toDate,
  formatDate,
  formatDateTime,
  formatTime,
  formatMonth,
  formatRelative,
  toDbDate,
  toDbMonth,
  companyToday,
  formatNumber,
  formatPercent,
  humanize,
  initials,
} from "./format";
export type { DateInput } from "./format";

export { downloadCsv, downloadBlob, csvEscape } from "./csv";
export type { CsvCell, CsvColumn } from "./csv";

export { createBrandedPdf, addPdfFooter, brandTableStyles, exportTablePdf, loadImageDataUrl, loadPdfLibs, BRAND_RGB } from "./pdf";
export type { BrandedPdfOptions, ExportTablePdfOptions, PdfCompany, RowInput, UserOptions } from "./pdf";

export { Skeleton, StatGridSkeleton, TableSkeleton, CardSkeleton, ListSkeleton, PageSkeleton } from "./Skeletons";

export { TabsNav, useTabParam } from "./TabsNav";
export type { TabItem, TabsNavProps } from "./TabsNav";

export { RoleGate, useHasRole } from "@/components/auth/RoleGate";
export type { RoleGateProps } from "@/components/auth/RoleGate";
