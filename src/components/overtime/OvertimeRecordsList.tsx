import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";

export default function OvertimeRecordsList() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { currency } = useCurrency();
  const queryClient = useQueryClient();
  const isAdmin = userProfile?.is_admin;
  const [statusFilter, setStatusFilter] = useState("all");
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: records, isLoading } = useQuery({
    queryKey: ["overtime-records", userProfile?.company_id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("overtime_records")
        .select("*, employees(name)")
        .eq("company_id", userProfile!.company_id!)
        .order("date", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.company_id,
  });

  const handleAction = async (id: string, status: string) => {
    try {
      setActingId(id);
      const { error } = await supabase.from("overtime_records").update({ status, reviewed_by: userProfile!.id, reviewed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      toast({ title: `Overtime ${status}` });
      queryClient.invalidateQueries({ queryKey: ["overtime-records"] });
    } catch (error: any) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    approved: "default",
    rejected: "destructive",
  };

  const pendingCount = useMemo(() => (records || []).filter((rec: any) => rec.status === "pending").length, [records]);

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
      <CardHeader className="flex flex-col gap-4 py-4 px-5 bg-muted/5 border-b border-border/50">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <Clock className="h-4 w-4 text-primary" />
            Overtime Records
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="rounded-lg bg-background font-bold px-2 py-0.5 border-border/60">Total: {records?.length || 0}</Badge>
            <Badge variant="secondary" className="rounded-lg font-bold px-2 py-0.5">Pending: {pendingCount}</Badge>
          </div>
        </div>
        <div className="shrink-0 bg-background rounded-xl border border-border/50 p-1 shadow-sm w-full md:w-56">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full h-8 border-0 bg-transparent shadow-none focus:ring-0 text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-lg border-border/50">
              <SelectItem value="all" className="text-xs font-medium cursor-pointer rounded-lg hover:bg-muted/50">All Status</SelectItem>
              <SelectItem value="pending" className="text-xs font-medium cursor-pointer rounded-lg hover:bg-muted/50">Pending</SelectItem>
              <SelectItem value="approved" className="text-xs font-medium cursor-pointer rounded-lg hover:bg-muted/50">Approved</SelectItem>
              <SelectItem value="rejected" className="text-xs font-medium cursor-pointer rounded-lg hover:bg-muted/50">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-5 md:p-6 bg-muted/5">
        <div className="space-y-3">
          {records?.map((rec: any) => (
            <div key={rec.id} className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:border-primary/30 hover:shadow-md transition-all duration-300 group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-bold text-foreground text-sm">{rec.employees?.name}</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {format(new Date(rec.date), "MMM dd, yyyy")} <span className="mx-1 opacity-50">•</span> {rec.hours}h <span className="mx-1 opacity-50">•</span> {rec.overtime_type} <span className="mx-1 opacity-50">•</span> {rec.multiplier}x
                  </p>
                  <p className="text-xs font-black text-primary">{currency} {Number(rec.total_amount).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 md:justify-end">
                <Badge variant={statusVariant[rec.status] || "outline"} className="capitalize rounded-lg px-2 py-0.5 text-[10px] font-bold tracking-wider">{rec.status}</Badge>
                {isAdmin && rec.status === "pending" && (
                  <div className="flex gap-1.5 ml-2">
                    <Button size="icon" variant="default" className="h-8 w-8 rounded-lg shadow-sm" disabled={actingId === rec.id} onClick={() => handleAction(rec.id, "approved")}>
                      {actingId === rec.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="destructive" className="h-8 w-8 rounded-lg shadow-sm" disabled={actingId === rec.id} onClick={() => handleAction(rec.id, "rejected")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!records || records.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Clock className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground">No Records Found</p>
              <p className="text-xs text-muted-foreground mt-1">There are no overtime records matching your filter.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
