import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Megaphone, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function PortalAnnouncementsTab() {
  const { employee } = useEmployeeAuth();

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['portal-announcements', employee?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('company_id', employee?.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.company_id
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {announcements?.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-dashed shadow-sm">
          <Megaphone className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm font-medium">No active announcements</p>
        </div>
      ) : (
        announcements?.map(ann => (
          <Card key={ann.id} className="relative overflow-hidden border-0 shadow-md">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
            <CardHeader className="pb-3 bg-blue-50/30">
              <CardTitle className="text-base text-slate-800">{ann.title}</CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Posted on {format(new Date(ann.created_at), 'PPP')}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{ann.content}</p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
