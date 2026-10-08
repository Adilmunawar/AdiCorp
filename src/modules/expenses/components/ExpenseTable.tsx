import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DataTable, EmptyState, formatDate, formatMoney, type DataColumn } from "@/components/kit";
import { BILLING_LABELS, CATEGORY_SHORT, quoted, type ExpenseRow } from "../kinds";
import { CategoryIcon, ExpenseStatusBadge, Stage } from "./bits";

export interface ExpenseTableProps {
  rows: ExpenseRow[];
  /** Base path of the detail page, e.g. "/expenses" or "/portal/expenses". */
  basePath: string;
  /** Show what was paid (Finance, or the employee's own list). */
  money?: boolean;
  /** Company currency for the paid column. */
  currency?: string;
  /** Show the "For" column (not on an employee's own list). */
  who?: boolean;
  actions?: (x: ExpenseRow) => ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  pageSize?: number;
  caption?: string;
  /** The company's today, for "renews soon / overdue" (the browser's when left out). */
  today?: string;
}

/** The list every role works from. */
export function ExpenseTable({ rows, basePath, money = false, currency = "USD", who = true, actions, empty, loading, pageSize = 15, caption, today }: ExpenseTableProps) {
  const columns: DataColumn<ExpenseRow>[] = [
    {
      id: "what",
      header: "Expense",
      sortValue: (x) => x.title.toLowerCase(),
      cell: (x) => (
        <div className="flex min-w-0 items-start gap-2.5">
          <CategoryIcon category={x.category} className="mt-0.5 hidden sm:flex" />
          <div className="min-w-0">
            <Link to={`${basePath}/${x.id}`} className="font-semibold text-foreground hover:text-primary [overflow-wrap:anywhere]" onClick={(e) => e.stopPropagation()}>
              {x.title}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{CATEGORY_SHORT[x.category]}</span>
              {x.provider && <span>· {x.provider}</span>}
              {x.reimburse && <span className="font-semibold text-warning">· Reimburse</span>}
            </div>
            <Stage x={x} today={today} className="mt-0.5 block" />
          </div>
        </div>
      ),
    },
    ...(who
      ? [
          {
            id: "for",
            header: "For",
            hideBelow: "md" as const,
            sortValue: (x: ExpenseRow) => x.employee?.name?.toLowerCase() ?? "",
            cell: (x: ExpenseRow) =>
              x.employee ? (
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{x.employee.name}</p>
                  {x.employee.department?.name && <p className="truncate text-[11px] text-muted-foreground">{x.employee.department.name}</p>}
                </div>
              ) : (
                <span className="text-muted-foreground">Whole company</span>
              ),
          },
        ]
      : []),
    {
      id: "cost",
      header: "Cost",
      align: "right",
      sortValue: (x) => Number(x.amount),
      cell: (x) => (
        <div className="tabular whitespace-nowrap">
          {quoted(x.amount, x.currency)}
          {x.billing !== "once" && <span className="block text-[11px] text-muted-foreground">{BILLING_LABELS[x.billing].toLowerCase()}</span>}
        </div>
      ),
    },
    ...(money
      ? [
          {
            id: "paid",
            header: "Paid",
            align: "right" as const,
            hideBelow: "lg" as const,
            sortValue: (x: ExpenseRow) => x.paid_total ?? 0,
            cell: (x: ExpenseRow) => (
              <span className={x.paid_total ? "tabular whitespace-nowrap text-foreground" : "text-muted-foreground"}>
                {x.paid_total ? formatMoney(x.paid_total, currency) : "—"}
              </span>
            ),
          },
        ]
      : []),
    {
      id: "status",
      header: "Status",
      sortValue: (x) => x.status,
      cell: (x) => <ExpenseStatusBadge status={x.status} />,
    },
    {
      id: "created",
      header: "Added",
      hideBelow: "lg",
      hideOnCard: true,
      sortValue: (x) => x.created_at,
      cell: (x) => <span className="tabular whitespace-nowrap text-muted-foreground">{formatDate(x.created_at)}</span>,
    },
    ...(actions
      ? [
          {
            id: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            cell: (x: ExpenseRow) => (
              <div className="flex justify-start sm:justify-end" onClick={(e) => e.stopPropagation()}>
                {actions(x)}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(x) => x.id}
      loading={loading}
      pageSize={pageSize}
      caption={caption}
      empty={empty ?? <EmptyState title="Nothing here" description="Try another tab." compact />}
    />
  );
}
