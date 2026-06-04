import React, { useState } from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { DollarSign, FileText, ChevronDown, ChevronUp, Calendar } from "lucide-react";
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

  const monthlyPayslips = React.useMemo(() => {
    const grouped = payslips.reduce((acc: any, slip: any) => {
      const monthKey = format(parseISO(slip.month), 'yyyy-MM');
      if (!acc[monthKey]) {
        acc[monthKey] = {
          id: monthKey,
          month: slip.month,
          basic_salary: 0,
          gross_salary: 0,
          net_salary: 0,
          total_deductions: 0,
          overtime_hours: 0,
          overtime_earnings: 0,
          days_worked: 0,
          recordCount: 0
        };
      }
      
      acc[monthKey].basic_salary += Number(slip.basic_salary) || 0;
      acc[monthKey].gross_salary += Number(slip.gross_salary) || 0;
      acc[monthKey].net_salary += Number(slip.net_salary) || 0;
      acc[monthKey].total_deductions += Number(slip.total_deductions) || 0;
      acc[monthKey].overtime_hours += Number(slip.overtime_hours) || 0;
      acc[monthKey].overtime_earnings += Number(slip.overtime_earnings) || 0;
      acc[monthKey].days_worked += Number(slip.days_worked) || 0;
      acc[monthKey].recordCount += 1;
      
      return acc;
    }, {});
    
    return Object.values(grouped).sort((a: any, b: any) => 
      new Date(b.month).getTime() - new Date(a.month).getTime()
    );
  }, [payslips]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <h2 className="text-lg font-black tracking-tight text-foreground">Payroll History</h2>
        <span className="text-xs font-bold text-muted-foreground flex items-center gap-1 bg-muted/50 px-2.5 py-1 rounded-full uppercase tracking-wider">
          <DollarSign className="w-3.5 h-3.5" /> All Months
        </span>
      </div>

      {monthlyPayslips.length === 0 ? (
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
          {monthlyPayslips.map((payslip: any) => {
            const isExpanded = expandedId === payslip.id;
            return (
              <Card key={payslip.id} className={`border border-border/40 shadow-lg rounded-[2rem] overflow-hidden transition-all duration-300 ${isExpanded ? 'bg-card ring-1 ring-primary/10' : 'bg-card/60 hover:bg-card'}`}>
                <div 
                  className="p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : payslip.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center shrink-0 shadow-inner border border-primary/10">
                      <Calendar className="w-6 h-6" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-base font-black text-foreground tracking-tight">
                        {format(parseISO(payslip.month), 'MMMM yyyy')}
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground tracking-wide mt-0.5">
                        {payslip.recordCount} {payslip.recordCount === 1 ? 'Record' : 'Records'} Processed
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Total Net</p>
                      <p className="text-sm font-black text-primary tracking-tight">
                        <span className="opacity-70 mr-0.5">PKR</span>{Math.round(payslip.net_salary).toLocaleString()}
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
                          <p className="font-black text-base mt-1 tracking-tight">{Math.round(payslip.basic_salary).toLocaleString()}</p>
                        </div>
                        <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2"><DollarSign className="w-3 h-3 text-emerald-700" /></div>
                          <p className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-widest">Gross Earnings</p>
                          <p className="font-black text-base text-emerald-700 mt-1 tracking-tight">{Math.round(payslip.gross_salary).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted/30 p-4 rounded-2xl border border-border/30">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center mb-2"><Clock className="w-3 h-3 text-muted-foreground" /></div>
                          <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest">Total Days</p>
                          <p className="font-black text-base mt-1 tracking-tight">{payslip.days_worked}</p>
                        </div>
                        <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
                          <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center mb-2"><DollarSign className="w-3 h-3 text-red-700" /></div>
                          <p className="text-[10px] text-red-700 font-extrabold uppercase tracking-widest">Total Deductions</p>
                          <p className="font-black text-base text-red-700 mt-1 tracking-tight">{Math.round(payslip.total_deductions).toLocaleString()}</p>
                        </div>
                      </div>

                      {payslip.overtime_hours > 0 && (
                        <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] mt-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-amber-700 font-extrabold uppercase tracking-widest">Overtime Logged</p>
                              <p className="font-black text-sm text-amber-700 mt-1 tracking-tight">{payslip.overtime_hours} Hours</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-amber-700 font-extrabold uppercase tracking-widest">Extra Earnings</p>
                              <p className="font-black text-sm text-amber-700 mt-1 tracking-tight">+{Math.round(payslip.overtime_earnings).toLocaleString()}</p>
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
