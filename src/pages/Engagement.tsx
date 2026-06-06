import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, AlertCircle, BarChart2, Megaphone } from "lucide-react";
import PageTransition from "@/components/layout/PageTransition";
import ChatTab from "@/components/engagement/ChatTab";
import ComplaintsTab from "@/components/engagement/ComplaintsTab";
import PollsTab from "@/components/engagement/PollsTab";
import AnnouncementsTab from "@/components/engagement/AnnouncementsTab";
import Dashboard from "@/components/layout/Dashboard";

export default function Engagement() {
  const { user } = useAuth();
  
  const { data: profile } = useQuery({
    queryKey: ['admin-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user?.id).single();
      return data;
    },
    enabled: !!user
  });

  const { data: unreadMessages } = useQuery({
    queryKey: ['admin-unread-messages-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false);
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 3000
  });

  const { data: newComplaints } = useQuery({
    queryKey: ['admin-new-complaints-count', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return 0;
      const { count } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('status', 'pending');
      return count || 0;
    },
    enabled: !!profile?.company_id,
    refetchInterval: 5000
  });

  return (
    <Dashboard title="Engagement">
      <PageTransition>
        <div className="space-y-6 p-4 lg:p-6 bg-background min-h-screen">
          <div className="pb-4 border-b border-border/40">
            <h1 className="text-2xl font-black text-foreground tracking-tight">Engagement & Communication</h1>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              Connect with employees, handle issues, and gather feedback.
            </p>
          </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl mb-8 bg-slate-100/50 p-1.5 rounded-xl border border-border/50 shadow-sm backdrop-blur-sm">
            <TabsTrigger value="chat" className="relative flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg py-2 transition-all">
              <MessageCircle size={16} />
              <span className="hidden sm:inline font-semibold">Direct Chat</span>
              {(unreadMessages || 0) > 0 && (
                <span className="absolute top-1 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 min-w-4 h-4 flex items-center justify-center rounded-full animate-pulse">
                  {unreadMessages}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="complaints" className="relative flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm rounded-lg py-2 transition-all">
              <AlertCircle size={16} />
              <span className="hidden sm:inline font-semibold">Complaints</span>
              {(newComplaints || 0) > 0 && (
                <span className="absolute top-1 right-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 min-w-4 h-4 flex items-center justify-center rounded-full">
                  {newComplaints}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="polls" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-sm rounded-lg py-2 transition-all">
              <BarChart2 size={16} />
              <span className="hidden sm:inline font-semibold">Polls</span>
            </TabsTrigger>
            <TabsTrigger value="announcements" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg py-2 transition-all">
              <Megaphone size={16} />
              <span className="hidden sm:inline font-semibold">Notices</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="focus-visible:outline-none">
            <ChatTab />
          </TabsContent>

          <TabsContent value="complaints" className="focus-visible:outline-none">
            <ComplaintsTab />
          </TabsContent>

          <TabsContent value="polls" className="focus-visible:outline-none">
            <PollsTab />
          </TabsContent>

          <TabsContent value="announcements" className="focus-visible:outline-none">
            <AnnouncementsTab />
          </TabsContent>
        </Tabs>
        </div>
      </PageTransition>
    </Dashboard>
  );
}
