import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, UserCog, Clock, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function EmployeeUpdates() {
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["employee_update_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_update_requests")
        .select(`
          id,
          requested_changes,
          status,
          created_at,
          employee_id,
          employees (name, rank, cnic)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.rpc("process_update_request", {
        p_req_id: id,
        p_status: status
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee_update_requests"] });
      toast.success("Request processed successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to process request: ${error.message}`);
    }
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Employee Updates</h1>
          <p className="text-muted-foreground">Review and approve profile change requests from employees.</p>
        </div>
      </div>

      {!requests || requests.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
            <UserCog className="w-12 h-12 opacity-20" />
            <p className="text-lg font-medium">No pending requests</p>
            <p className="text-sm">Employees haven't submitted any new profile updates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((req: any) => (
            <Card key={req.id} className="overflow-hidden">
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                    {req.employees?.name?.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{req.employees?.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {req.employees?.rank} • {req.employees?.cnic}
                    </p>
                    
                    <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Requested Changes</p>
                      <div className="space-y-1">
                        {Object.entries(req.requested_changes).map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-sm">
                            <span className="font-medium text-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                            <span className="text-primary font-semibold">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 
                      Requested on {format(parseISO(req.created_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-row md:flex-col gap-2 shrink-0 border-t md:border-t-0 pt-4 md:pt-0">
                  <Button 
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                    onClick={() => processMutation.mutate({ id: req.id, status: "approved" })}
                    disabled={processMutation.isPending}
                  >
                    <Check className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => processMutation.mutate({ id: req.id, status: "rejected" })}
                    disabled={processMutation.isPending}
                  >
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
