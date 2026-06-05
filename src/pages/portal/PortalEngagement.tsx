import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, AlertCircle, BarChart2, Megaphone } from "lucide-react";
import PortalChatTab from "@/components/portal/PortalChatTab";
import PortalComplaintsTab from "@/components/portal/PortalComplaintsTab";
import PortalPollsTab from "@/components/portal/PortalPollsTab";
import PortalAnnouncementsTab from "@/components/portal/PortalAnnouncementsTab";

export default function PortalEngagement() {
  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Connect</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chat with HR, view announcements, or vote in polls.
        </p>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid grid-cols-4 w-full mb-6 bg-white border shadow-sm p-1 h-14 rounded-2xl">
          <TabsTrigger value="chat" className="flex flex-col items-center gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl py-1.5 h-full">
            <MessageCircle size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Chat</span>
          </TabsTrigger>
          <TabsTrigger value="complaints" className="flex flex-col items-center gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl py-1.5 h-full">
            <AlertCircle size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Issues</span>
          </TabsTrigger>
          <TabsTrigger value="polls" className="flex flex-col items-center gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl py-1.5 h-full">
            <BarChart2 size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Polls</span>
          </TabsTrigger>
          <TabsTrigger value="announcements" className="flex flex-col items-center gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl py-1.5 h-full">
            <Megaphone size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Notices</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="focus-visible:outline-none">
          <PortalChatTab />
        </TabsContent>

        <TabsContent value="complaints" className="focus-visible:outline-none">
          <PortalComplaintsTab />
        </TabsContent>

        <TabsContent value="polls" className="focus-visible:outline-none">
          <PortalPollsTab />
        </TabsContent>

        <TabsContent value="announcements" className="focus-visible:outline-none">
          <PortalAnnouncementsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
