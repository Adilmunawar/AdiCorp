import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, AlertCircle, BarChart2, Megaphone } from "lucide-react";
import PageTransition from "@/components/layout/PageTransition";
import ChatTab from "@/components/engagement/ChatTab";
import ComplaintsTab from "@/components/engagement/ComplaintsTab";
import PollsTab from "@/components/engagement/PollsTab";
import AnnouncementsTab from "@/components/engagement/AnnouncementsTab";
import Dashboard from "@/components/layout/Dashboard";

export default function Engagement() {
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
            <TabsTrigger value="chat" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg py-2 transition-all">
              <MessageCircle size={16} />
              <span className="hidden sm:inline font-semibold">Direct Chat</span>
            </TabsTrigger>
            <TabsTrigger value="complaints" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm rounded-lg py-2 transition-all">
              <AlertCircle size={16} />
              <span className="hidden sm:inline font-semibold">Complaints</span>
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
