import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, AlertCircle, BarChart2, Megaphone } from "lucide-react";
import PortalChatTab from "@/components/portal/PortalChatTab";
import PortalComplaintsTab from "@/components/portal/PortalComplaintsTab";
import PortalPollsTab from "@/components/portal/PortalPollsTab";
import PortalAnnouncementsTab from "@/components/portal/PortalAnnouncementsTab";

export default function PortalEngagement() {
  const { employee } = useEmployeeAuth();

  const { data: unreadData } = useQuery({
    queryKey: ['portal-unread-counts', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return { unread_messages: 0 };
      const { data, error } = await supabase.rpc('employee_get_unread_counts', {
        p_emp_id: employee.id
      });
      if (error) throw error;
      return data as { unread_messages: number };
    },
    enabled: !!employee?.id,
    refetchInterval: 3000
  });

  const unreadMessages = unreadData?.unread_messages || 0;

  return (
    <div className="space-y-4 pb-6 h-[calc(100vh-140px)] flex flex-col overflow-hidden">
      <Tabs defaultValue="chat" className="w-full flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-4 w-full mb-4 bg-slate-100 p-1 h-[60px] rounded-2xl shrink-0">
          <TabsTrigger value="chat" className="relative flex flex-col items-center justify-center gap-1 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-xl h-full transition-all focus-visible:ring-0 focus-visible:outline-none">
            <MessageCircle size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Chat</span>
            {unreadMessages > 0 && (
              <span className="absolute top-1 right-2 bg-red-500 text-white text-[9px] font-bold px-1 min-w-3.5 h-3.5 flex items-center justify-center rounded-full animate-pulse shadow-sm">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="complaints" className="flex flex-col items-center justify-center gap-1 data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm rounded-xl h-full transition-all focus-visible:ring-0 focus-visible:outline-none">
            <AlertCircle size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Issues</span>
          </TabsTrigger>
          <TabsTrigger value="polls" className="flex flex-col items-center justify-center gap-1 data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-sm rounded-xl h-full transition-all focus-visible:ring-0 focus-visible:outline-none">
            <BarChart2 size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Polls</span>
          </TabsTrigger>
          <TabsTrigger value="announcements" className="flex flex-col items-center justify-center gap-1 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-xl h-full transition-all focus-visible:ring-0 focus-visible:outline-none">
            <Megaphone size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Notices</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-0 flex-1 min-h-0 focus-visible:outline-none focus-visible:ring-0">
          <PortalChatTab />
        </TabsContent>

        <TabsContent value="complaints" className="mt-0 flex-1 min-h-0 overflow-y-auto focus-visible:outline-none focus-visible:ring-0">
          <PortalComplaintsTab />
        </TabsContent>

        <TabsContent value="polls" className="mt-0 flex-1 min-h-0 overflow-y-auto focus-visible:outline-none focus-visible:ring-0">
          <PortalPollsTab />
        </TabsContent>

        <TabsContent value="announcements" className="mt-0 flex-1 min-h-0 overflow-y-auto focus-visible:outline-none focus-visible:ring-0">
          <PortalAnnouncementsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
