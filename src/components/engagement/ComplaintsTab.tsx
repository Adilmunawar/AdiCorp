import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertCircle, Loader2, CheckCircle2, Clock, Search } from "lucide-react";
import { format } from "date-fns";

export default function ComplaintsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['admin-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user?.id).single();
      return data;
    },
    enabled: !!user
  });

  const { data: complaints, isLoading } = useQuery({
    queryKey: ['admin-complaints', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaints')
        .select(`
          *,
          employees ( name, rank )
        `)
        .eq('company_id', profile?.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase.from('complaints').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-complaints'] });
      toast.success("Complaint status updated");
    }
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary" className="bg-amber-100 text-amber-800"><Clock size={12} className="mr-1"/> Pending</Badge>;
      case 'investigating': return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Search size={12} className="mr-1"/> Investigating</Badge>;
      case 'resolved': return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle2 size={12} className="mr-1"/> Resolved</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertCircle className="text-amber-500" size={20} /> Employee Complaints
        </h2>
        <p className="text-sm text-slate-500">Manage and resolve issues reported by employees.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {complaints?.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
            <CheckCircle2 className="mx-auto mb-3 opacity-50" size={32} />
            <p>No complaints reported. Great job!</p>
          </div>
        ) : (
          complaints?.map(complaint => (
            <Card key={complaint.id} className={`rounded-2xl border-border/50 shadow-sm transition-all hover:shadow-md ${complaint.status === 'resolved' ? 'opacity-70 bg-slate-50' : 'bg-white'}`}>
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <CardTitle className="text-base font-bold">{complaint.subject}</CardTitle>
                    {getStatusBadge(complaint.status)}
                  </div>
                  <CardDescription className="text-xs">
                    Submitted by: {complaint.is_anonymous ? 
                      <span className="font-semibold italic text-slate-500">Anonymous</span> : 
                      <span className="font-semibold text-slate-700">{complaint.employees?.name} ({complaint.employees?.rank})</span>
                    }
                    {" • "}{format(new Date(complaint.created_at), 'PPp')}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {complaint.status === 'pending' && (
                    <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ id: complaint.id, status: 'investigating' })}>
                      Investigate
                    </Button>
                  )}
                  {complaint.status !== 'resolved' && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updateStatusMutation.mutate({ id: complaint.id, status: 'resolved' })}>
                      Mark Resolved
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-50/50 p-4 rounded-xl text-sm text-slate-700 whitespace-pre-wrap border border-slate-100 shadow-inner">
                  {complaint.description}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
