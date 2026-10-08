import { useCallback, useState } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import { CalendarDays, CalendarRange, Clock, Download, Loader2, Lock, LockOpen, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, FilterBar, MonthPicker, PageHeader, SectionCard, TabsNav, useTabParam } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useMarkAllPresent, useMonthRegister, useSetLock } from "../api";
import { DailySummaryPanel } from "../components/DailySummaryPanel";
import { ExportPanel } from "../components/ExportPanel";
import { RegisterGrid } from "../components/RegisterGrid";
import { DepartmentSelect, StatusLegend } from "../components/shared";
import { monthStart } from "../lib";

const TABS = [
  { value: "today", label: "Daily summary", icon: Clock },
  { value: "register", label: "Register", icon: CalendarRange },
  { value: "export", label: "Export", icon: Download },
];

export default function AttendancePage() {
  const { isHR } = useAuth();
  const [tab] = useTabParam(TABS);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Attendance"
        eyebrow="Time"
        icon={CalendarDays}
        description="Daily arrivals from the time clocks, the monthly register and official exports."
      >
        <TabsNav tabs={TABS} />
      </PageHeader>
      {tab === "today" && <DailySummaryPanel canEdit={isHR} />}
      {tab === "register" && <RegisterTab />}
      {tab === "export" && <ExportPanel />}
    </div>
  );
}

function RegisterTab() {
  const { isHR, isOwner } = useAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [department, setDepartment] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(0);
  const monthStr = monthStart(month);
  const { data, isLoading, isFetching } = useMonthRegister(monthStr, department);
  const markAll = useMarkAllPresent();
  const setLock = useSetLock();

  const onDirty = useCallback((n: number) => setDirty(n), []);
  const changeMonth = (next: Date) => {
    if (dirty > 0 && !window.confirm(`You have ${dirty} unsaved change${dirty === 1 ? "" : "s"}. Discard them?`)) return;
    setMonth(next);
  };

  const today = data?.today ?? format(new Date(), "yyyy-MM-dd");
  const monthEnd = data?.days[data.days.length - 1]?.date;
  const isPastMonth = !!monthEnd && monthEnd < today;
  const isLocked = !!data?.locked_through && !!monthEnd && monthEnd <= data.locked_through;
  const includesToday = !!data && data.days.some((d) => d.date === today);

  return (
    <SectionCard
      flush
      contentClassName="p-3 sm:p-4"
      title="Monthly register"
      description={
        data
          ? `${data.employees.length} ${data.employees.length === 1 ? "person" : "people"}${isLocked ? " · this month is locked" : ""}${data.locked_through && !isLocked ? ` · locked through ${format(parseISO(data.locked_through), "MMMM yyyy")}` : ""}`
          : "Loading the register…"
      }
      icon={CalendarRange}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker selectedMonth={month} onMonthChange={changeMonth} />
          {isHR && includesToday && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl"
              disabled={markAll.isPending}
              // With a department picked, only the people on this register are marked.
              onClick={() => markAll.mutate({ date: today, employeeIds: department ? (data?.employees ?? []).map((e) => e.id) : undefined })}
            >
              {markAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
              {department ? "Mark this department present today" : "Mark everyone present today"}
            </Button>
          )}
          {isHR && isPastMonth && !isLocked && (
            <ConfirmButton
              size="sm"
              variant="outline"
              className="h-9 rounded-xl"
              destructive={false}
              title={`Lock ${format(month, "MMMM yyyy")}?`}
              description="Attendance up to the end of this month can no longer be changed, and punch corrections for it are refused. Only the owner can unlock it."
              confirmLabel="Lock month"
              onConfirm={() => setLock.mutateAsync(monthStr)}
            >
              <Lock className="h-4 w-4" aria-hidden /> Lock month
            </ConfirmButton>
          )}
          {isOwner && isLocked && (
            <ConfirmButton
              size="sm"
              variant="outline"
              className="h-9 rounded-xl"
              title={`Unlock ${format(month, "MMMM yyyy")}?`}
              description="HR will be able to change attendance for this month and later months again. Payslips already issued are not changed."
              confirmLabel="Unlock"
              // Unlocking a month keeps every earlier month locked.
              onConfirm={() => setLock.mutateAsync(monthStart(new Date(month.getFullYear(), month.getMonth() - 1, 1)))}
            >
              <LockOpen className="h-4 w-4" aria-hidden /> Unlock
            </ConfirmButton>
          )}
        </div>
      }
    >
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <FilterBar search={search} onSearchChange={setSearch} placeholder="Search name, code or department" className="lg:max-w-md">
          <DepartmentSelect value={department} onChange={setDepartment} />
        </FilterBar>
        <StatusLegend className="hidden sm:flex" />
      </div>
      <div className={isFetching && !isLoading ? "opacity-80 transition-opacity" : undefined}>
        <RegisterGrid data={data} loading={isLoading} search={search} onDirtyChange={onDirty} />
      </div>
      {/* Phones: the legend sits under the grid so the grid starts higher on the screen. */}
      <StatusLegend className="mt-3 sm:hidden" />
    </SectionCard>
  );
}
