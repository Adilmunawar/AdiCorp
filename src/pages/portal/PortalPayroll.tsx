import React, { useState } from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, startOfToday, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { DollarSign, FileText, ChevronDown, ChevronUp, Calendar, Clock, Calculator } from "lucide-react";
import { isWorkingDayForEmployee } from "@/utils/workingDays";
import { Button } from "@/components/ui/button";

export default function PortalPayroll() {
  const { data, isLoading } = useEmployeePortalData();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    );
  }

  const payslips = data?.payslips || [];
  const attendance = data?.attendance || [];
  const leaveRequests = (data as any)?.leave_requests || [];
  const events = (data as any)?.events || [];
  const profile = data?.profile;

  const monthlyPayslips = React.useMemo(() => {
    // Sort slips so newest is first (by created_at or id)
    const sortedSlips = [...payslips].sort((a: any, b: any) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : a.id;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : b.id;
      return timeB - timeA;
    });

    const grouped = sortedSlips.reduce((acc: any, slip: any) => {
      const monthKey = format(parseISO(slip.month), 'yyyy-MM');
      // Only keep the first (newest) record we encounter for any given month
      if (!acc[monthKey]) {
        acc[monthKey] = {
          ...slip,
          id: slip.id || monthKey,
          recordCount: 1
        };
      } else {
        // If we see another record for the same month, just increment the count to indicate a revision
        acc[monthKey].recordCount += 1;
      }
      return acc;
    }, {});
    
    return Object.values(grouped).sort((a: any, b: any) => 
      new Date(b.month).getTime() - new Date(a.month).getTime()
    );
  }, [payslips]);

  const currentMonthKey = format(startOfToday(), 'yyyy-MM');
  const hasCurrentMonthPayslip = monthlyPayslips.some((p: any) => format(parseISO(p.month), 'yyyy-MM') === currentMonthKey);

  const estimate = React.useMemo(() => {
    if (!profile || hasCurrentMonthPayslip) return null;
    
    const start = startOfMonth(startOfToday());
    const end = endOfMonth(startOfToday());
    
    const workingDaysPerWeek = profile.working_days_per_week || 6;
    
    let presentDays = 0;
    let shortLeaveDays = 0;
    let paidLeaveDays = 0;
    let absentDays = 0;
    let workingDaysCount = 0;

    const daysInMonth = eachDayOfInterval({ start, end });

    daysInMonth.forEach(day => {
      if (isWorkingDayForEmployee(day, workingDaysPerWeek)) {
         workingDaysCount++;
         const dateStr = format(day, 'yyyy-MM-dd');
         const record = attendance.find((a: any) => a.date === dateStr);
         
         if (record?.status === 'present') {
             presentDays++;
         } else if (record?.status === 'short_leave') {
             shortLeaveDays++;
         } else {
             const isLeaveApproved = leaveRequests.some((l: any) => dateStr >= l.start_date && dateStr <= l.end_date);
             const isEventHoliday = events.some((e: any) => e.date === dateStr);
             
             if (isLeaveApproved || isEventHoliday) {
                 paidLeaveDays++;
             } else {
                 absentDays++;
             }
         }
      }
    });

    const actualWorkingDays = presentDays + (shortLeaveDays * 0.5) + paidLeaveDays;
    
    const basicSalary = Number(profile.wage_rate) || 0;
    const divisor = Number(profile.salary_divisor) || 26;
    const dailyRate = basicSalary / divisor;
    
    // We already counted exact absents among working days
    const totalDeductions = absentDays * dailyRate + (shortLeaveDays * (dailyRate / 2));
    
    const netSalary = basicSalary - totalDeductions;

    return {
      id: 'estimate',
      month: startOfToday().toISOString(),
      basic_salary: basicSalary,
      gross_salary: basicSalary, // Simplified
      net_salary: netSalary,
      total_deductions: totalDeductions,
      overtime_hours: 0,
      overtime_earnings: 0,
      days_worked: actualWorkingDays,
      present_days: presentDays,
      absent_days: absentDays,
      short_leave_days: shortLeaveDays,
      paid_leave_days: paidLeaveDays,
      recordCount: 0,
      isEstimate: true
    };
  }, [profile, hasCurrentMonthPayslip, attendance, leaveRequests]);

  const displayList = estimate ? [estimate, ...monthlyPayslips] : monthlyPayslips;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <h2 className="text-lg font-black tracking-tight text-foreground">Payroll History</h2>
        <span className="text-xs font-bold text-muted-foreground flex items-center gap-1 bg-muted/50 px-2.5 py-1 rounded-full uppercase tracking-wider">
          <DollarSign className="w-3.5 h-3.5" /> All Months
        </span>
      </div>

      {displayList.length === 0 ? (
        <Card className="border-border/40 shadow-sm rounded-[2rem] bg-muted/10">
          <CardContent className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
              <FileText className="w-6 h-6 opacity-40" />
            </div>
            <p className="font-semibold">No payslips generated yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayList.map((payslip: any) => {
            const isExpanded = expandedId === payslip.id;
            return (
              <Card key={payslip.id} className={`border border-border/40 shadow-lg rounded-[2rem] overflow-hidden transition-all duration-300 ${isExpanded ? 'bg-card ring-1 ring-primary/10' : 'bg-card/60 hover:bg-card'}`}>
                <div 
                  className="p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : payslip.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border ${payslip.isEstimate ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500 border-blue-500/10' : 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary border-primary/10'}`}>
                      {payslip.isEstimate ? <Calculator className="w-6 h-6" strokeWidth={2.5} /> : <Calendar className="w-6 h-6" strokeWidth={2.5} />}
                    </div>
                    <div>
                      <p className="text-base font-black text-foreground tracking-tight">
                        {format(parseISO(payslip.month), 'MMMM yyyy')}
                      </p>
                      <p className={`text-[11px] font-bold tracking-wide mt-0.5 ${payslip.isEstimate ? 'text-blue-500' : 'text-muted-foreground'}`}>
                        {payslip.isEstimate ? 'Real-Time Estimate' : payslip.recordCount > 1 ? `Latest Revision (${payslip.recordCount})` : 'Finalized Record'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Total Net</p>
                      <p className="text-sm font-black text-primary tracking-tight">
                        <span className="opacity-70 mr-0.5">PKR</span>{Math.round(Number(payslip.net_salary) || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isExpanded ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-300">
                    <div className="pt-5 border-t border-border/40 flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted/30 p-4 rounded-2xl border border-border/30">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center mb-2"><DollarSign className="w-3 h-3 text-muted-foreground" /></div>
                          <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest">Base Salary</p>
                          <p className="font-black text-base mt-1 tracking-tight">{Math.round(Number(payslip.basic_salary) || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2"><DollarSign className="w-3 h-3 text-emerald-700" /></div>
                          <p className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-widest">Gross Earnings</p>
                          <p className="font-black text-base text-emerald-700 mt-1 tracking-tight">{Math.round(Number(payslip.gross_salary) || 0).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted/30 p-4 rounded-2xl border border-border/30">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center mb-2"><Clock className="w-3 h-3 text-muted-foreground" /></div>
                          <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest">Attendance</p>
                          <p className="font-black text-base mt-1 tracking-tight">{Number(payslip.days_worked) || 0} <span className="text-xs text-muted-foreground font-semibold">Total Days</span></p>
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50 text-[10px] font-bold text-muted-foreground flex-wrap">
                            <span className="text-emerald-600">{Number(payslip.present_days) || 0} P</span>
                            <span className="text-red-500">{Number(payslip.absent_days) || 0} A</span>
                            <span className="text-orange-500">{Number(payslip.short_leave_days) || 0} SL</span>
                            <span className="text-blue-500">{Number(payslip.paid_leave_days) || 0} L</span>
                          </div>
                        </div>
                        <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
                          <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center mb-2"><DollarSign className="w-3 h-3 text-red-700" /></div>
                          <p className="text-[10px] text-red-700 font-extrabold uppercase tracking-widest">Total Deductions</p>
                          <p className="font-black text-base text-red-700 mt-1 tracking-tight">{Math.round(Number(payslip.total_deductions) || 0).toLocaleString()}</p>
                        </div>
                      </div>

                      {Number(payslip.overtime_hours) > 0 && (
                        <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] mt-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-amber-700 font-extrabold uppercase tracking-widest">Overtime Logged</p>
                              <p className="font-black text-sm text-amber-700 mt-1 tracking-tight">{Number(payslip.overtime_hours) || 0} Hours</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-amber-700 font-extrabold uppercase tracking-widest">Extra Earnings</p>
                              <p className="font-black text-sm text-amber-700 mt-1 tracking-tight">+{Math.round(Number(payslip.overtime_earnings) || 0).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
