import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, FileText } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";
import MonthSelector from "@/components/common/MonthSelector";
import { useState } from "react";
import { startOfMonth } from "date-fns";

export default function PayslipHistory() {
  const { userProfile } = useAuth();
  const { currency } = useCurrency();
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));

  const { data: payslips, isLoading } = useQuery({
    queryKey: ["payslip-history", userProfile?.company_id, format(selectedMonth, "yyyy-MM")],
    queryFn: async () => {
      const monthStr = format(selectedMonth, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("payslips")
        .select("*, employees(name, rank)")
        .eq("company_id", userProfile!.company_id!)
        .eq("month", monthStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.company_id,
  });

  const formatAmount = (amount: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 0 }).format(amount);
    } catch { return `${currency} ${amount.toLocaleString()}`; }
  };

  if (isLoading) {
    return (
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-44" />
        </CardHeader>
        <CardContent className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-4 px-5 bg-muted/5 border-b border-border/50">
        <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
          <History className="h-4 w-4 text-primary" />
          Payslip History
          <Badge variant="outline" className="ml-1 rounded-md bg-background px-1.5 font-bold text-xs">
            {payslips?.length || 0}
          </Badge>
        </CardTitle>
        <div className="shrink-0 bg-background rounded-lg border border-border/50 p-1 shadow-sm">
          <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
        </div>
      </CardHeader>
      <CardContent className="p-5 md:p-6 bg-muted/5">
        <div className="space-y-3">
          {payslips?.map((ps: any) => (
            <div key={ps.id} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:border-primary/30 hover:shadow-md transition-all duration-300 group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10 group-hover:bg-primary/20 transition-colors">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="font-bold text-foreground text-sm">{ps.employees?.name}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ps.employees?.rank}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                    {ps.present_days}P / {ps.short_leave_days}SL <span className="mx-1.5 opacity-50">•</span> {ps.days_worked} days earned
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Net Payout</span>
                <p className="font-black text-primary text-base">{formatAmount(Number(ps.net_salary))}</p>
              </div>
            </div>
          ))}
          {(!payslips || payslips.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <History className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground">No History Found</p>
              <p className="text-xs text-muted-foreground mt-1">No payslips have been generated for {format(selectedMonth, "MMMM yyyy")}.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
