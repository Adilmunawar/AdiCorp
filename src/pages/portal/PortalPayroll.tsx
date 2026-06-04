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

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <h2 className="text-lg font-black tracking-tight text-foreground">Payroll History</h2>
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5" /> All Records
        </span>
      </div>

      {payslips.length === 0 ? (
        <Card className="border-border/40 shadow-sm rounded-3xl">
          <CardContent className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-2">
            <FileText className="w-8 h-8 opacity-20" />
            No payslips found yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payslips.map((payslip: any) => {
            const isExpanded = expandedId === payslip.id;
            return (
              <Card key={payslip.id} className="border-border/40 shadow-sm rounded-3xl overflow-hidden transition-all duration-300">
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(isExpanded ? null : payslip.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {format(parseISO(payslip.month), 'MMMM yyyy')}
                      </p>
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mt-0.5">
                        Net: {Number(payslip.net_salary).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="pt-4 border-t border-border/40 flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted/30 p-3 rounded-xl border border-border/30">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase">Basic Salary</p>
                          <p className="font-bold text-sm mt-0.5">{Number(payslip.basic_salary).toLocaleString()}</p>
                        </div>
                        <div className="bg-green-500/10 p-3 rounded-xl border border-green-500/20">
                          <p className="text-[10px] text-green-700 font-semibold uppercase">Gross Salary</p>
                          <p className="font-bold text-sm text-green-700 mt-0.5">{Number(payslip.gross_salary).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted/30 p-3 rounded-xl border border-border/30">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase">Days Worked</p>
                          <p className="font-bold text-sm mt-0.5">{payslip.days_worked}</p>
                        </div>
                        <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                          <p className="text-[10px] text-red-700 font-semibold uppercase">Deductions</p>
                          <p className="font-bold text-sm text-red-700 mt-0.5">{Number(payslip.total_deductions).toLocaleString()}</p>
                        </div>
                      </div>

                      {Number(payslip.overtime_hours) > 0 && (
                        <div className="bg-orange-500/10 p-3 rounded-xl border border-orange-500/20 text-xs">
                          <p className="text-[10px] text-orange-700 font-semibold uppercase flex justify-between">
                            <span>Overtime ({payslip.overtime_hours} hrs)</span>
                            <span>+{Number(payslip.overtime_earnings).toLocaleString()}</span>
                          </p>
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
