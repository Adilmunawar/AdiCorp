
import Dashboard from "@/components/layout/Dashboard";
import AdvancedEventManager from "@/components/events/AdvancedEventManager";
import RecurringEventManager from "@/components/events/RecurringEventManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Globe } from "lucide-react";

const EventsPage = () => {
  return (
    <Dashboard title="Events & Calendar Management">
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-5 bg-muted/5 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" /> Events & Calendar Management
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Manage company-wide events, holidays, and international schedules.</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="events" className="space-y-4">
          <div className="rounded-2xl border border-border bg-card shadow-sm p-2 overflow-x-auto hide-scrollbar">
            <TabsList className="bg-transparent flex sm:grid sm:grid-cols-2 gap-2 h-auto min-w-max sm:min-w-0 p-0">
              <TabsTrigger value="events" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground hover:bg-muted/50 data-[state=active]:hover:bg-primary/90 transition-all duration-300 rounded-xl text-xs font-bold uppercase tracking-wider">
                <Calendar className="mr-2 h-4 w-4" /> Event Manager
              </TabsTrigger>
              <TabsTrigger value="international" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground hover:bg-muted/50 data-[state=active]:hover:bg-primary/90 transition-all duration-300 rounded-xl text-xs font-bold uppercase tracking-wider">
                <Globe className="mr-2 h-4 w-4" /> International Standards
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="events"><AdvancedEventManager /></TabsContent>
          <TabsContent value="international"><RecurringEventManager /></TabsContent>
        </Tabs>
      </div>
    </Dashboard>
  );
};

export default EventsPage;
