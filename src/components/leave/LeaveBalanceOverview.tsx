import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function LeaveBalanceOverview() {
  const { userProfile } = useAuth();
  const currentYear = new Date().getFullYear();

  const { data: balances, isLoading } = useQuery({
    queryKey: ["leave-balances", userProfile?.company_id, currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_balances")
        .select("*, employees(name), leave_types(name)")
        .eq("year", currentYear);
      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.company_id,
  });

  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>;
  }

  // Group by employee
  const grouped = (balances || []).reduce((acc: Record<string, any[]>, b: any) => {
    const name = b.employees?.name || "Unknown";
    if (!acc[name]) acc[name] = [];
    acc[name].push(b);
    return acc;
  }, {});

  return (
    <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 bg-muted/5 border-b border-border/50">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Leave Balances
          </CardTitle>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{currentYear} Quotas</p>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {Object.keys(grouped).length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center mb-3">
              <BarChart3 className="h-5 w-5 text-primary/40" />
            </div>
            <p className="text-sm font-bold text-foreground">No leave balances found</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">Configure leave policies and initialize employee balances to see them here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([name, items]) => (
              <div key={name} className="p-4 rounded-xl bg-muted/20 border border-border/50 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">{name}</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {(items as any[]).map((b: any) => {
                    const used = Number(b.used_days);
                    const total = Number(b.total_days);
                    const remaining = total - used;
                    const pct = total > 0 ? (used / total) * 100 : 0;
                    const isCritical = remaining <= 2;
                    
                    return (
                      <div key={b.id} className={`p-3 rounded-xl border ${isCritical && total > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-background border-border/60'} shadow-sm flex flex-col justify-between`}>
                        <p className="text-[11px] font-bold text-foreground uppercase tracking-wide truncate">{b.leave_types?.name || "Unknown"}</p>
                        <div className="mt-2">
                          <div className="flex items-baseline gap-1">
                            <span className={`text-xl font-black ${isCritical && total > 0 ? 'text-red-600' : 'text-primary'}`}>{remaining}</span>
                            <span className="text-[10px] font-semibold text-muted-foreground">/ {total}</span>
                          </div>
                          <Progress value={pct} className={`mt-1.5 h-1.5 ${isCritical && total > 0 ? '[&>div]:bg-red-500' : ''}`} />
                          <p className="text-[9px] text-muted-foreground mt-1.5 font-medium">{used} used</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
