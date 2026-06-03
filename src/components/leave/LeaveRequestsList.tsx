import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Clock, CalendarDays, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function LeaveRequestsList() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = userProfile?.is_admin;
  const [statusFilter, setStatusFilter] = useState("all");
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["leave-requests", userProfile?.company_id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("leave_requests")
        .select("*, employees(name), leave_types(name, type)")
        .eq("company_id", userProfile!.company_id!)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "approved" | "rejected" | "cancelled");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.company_id,
  });

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    try {
      setActingId(id);
      const { error } = await supabase
        .from("leave_requests")
        .update({ status, reviewed_by: userProfile!.id, reviewed_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      toast({ title: `Leave request ${status}` });
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
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
    cancelled: "outline",
  };

  const pendingCount = useMemo(() => {
    return (requests || []).filter((request: any) => request.status === "pending").length;
  }, [requests]);

  if (!userProfile?.company_id) {
    return (
      <Card className="border border-border bg-card shadow-sm">
        <CardContent className="py-8 text-center text-muted-foreground">
          Complete company setup to manage leave requests.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 bg-muted/5 border-b border-border/50">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Leave Requests
          </CardTitle>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-semibold bg-background border border-border/50 px-2 py-0.5 rounded-md">Total: {requests?.length || 0}</span>
            <span className="font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded-md">Pending: {pendingCount}</span>
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px] h-9 text-xs rounded-xl bg-background border-border/50 shadow-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Status</SelectItem>
              <SelectItem value="pending" className="text-xs">Pending</SelectItem>
              <SelectItem value="approved" className="text-xs">Approved</SelectItem>
              <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
              <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/30">
          {requests?.map((req: any) => (
            <div key={req.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-muted/10 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col">
                  <p className="font-bold text-sm text-foreground leading-tight">{req.employees?.name}</p>
                  <p className="text-[11px] font-semibold text-primary/80 mt-0.5 uppercase tracking-wide">
                    {req.leave_types?.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground font-medium">
                    <span className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded border border-border/50">
                      <CalendarDays className="w-3 h-3" />
                      {format(new Date(req.start_date), "MMM dd")} - {format(new Date(req.end_date), "MMM dd, yyyy")}
                    </span>
                    <span className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded border border-border/50">
                      <Clock className="w-3 h-3" />
                      {req.days_count} day(s)
                    </span>
                  </div>
                  {req.reason && <p className="text-[11px] text-muted-foreground italic mt-2 border-l-2 border-border/50 pl-2 leading-tight">{req.reason}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 sm:justify-end mt-2 sm:mt-0">
                <Badge variant={statusVariant[req.status] || "outline"} className={`capitalize text-[10px] px-2 py-0.5 font-bold shadow-sm ${
                  req.status === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 
                  req.status === 'approved' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                  req.status === 'rejected' ? 'bg-red-500/10 text-red-600 border-red-500/20' : ''
                }`}>
                  {req.status}
                </Badge>
                {isAdmin && req.status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[10px] rounded-lg bg-green-500/5 hover:bg-green-500/15 border-green-500/20 text-green-600 shadow-sm" disabled={actingId === req.id} onClick={() => handleAction(req.id, "approved")}>
                      {actingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />} Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-[10px] rounded-lg bg-red-500/5 hover:bg-red-500/15 border-red-500/20 text-red-600 shadow-sm" disabled={actingId === req.id} onClick={() => handleAction(req.id, "rejected")}>
                      <X className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!requests || requests.length === 0) && (
            <div className="p-10 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center mb-3">
                <CalendarDays className="h-5 w-5 text-primary/40" />
              </div>
              <p className="text-sm font-bold text-foreground">No leave requests found</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">When employees submit time off, it will appear here for your review.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
