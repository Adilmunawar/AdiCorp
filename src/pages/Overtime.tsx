import { useState } from "react";
import Dashboard from "@/components/layout/Dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Settings2 } from "lucide-react";
import OvertimeRecordsList from "@/components/overtime/OvertimeRecordsList";
import OvertimeEntryForm from "@/components/overtime/OvertimeEntryForm";
import OvertimeConfigPanel from "@/components/overtime/OvertimeConfigPanel";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";

export default function OvertimePage() {
  const [activeTab, setActiveTab] = useState("records");
  const [showEntryForm, setShowEntryForm] = useState(false);
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.is_admin;

  return (
    <Dashboard title="Overtime Tracking">
      <div className="space-y-6">
        <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl font-bold text-foreground">Overtime Tracking</h2>
                {isAdmin && <Badge variant="secondary">Admin View</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">Track, review, and approve overtime with a faster operational workflow.</p>
            </div>
            <Button onClick={() => setShowEntryForm(true)} className="gap-2 w-full md:w-auto">
              <Plus className="h-4 w-4" />
              Log Overtime
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="rounded-2xl border border-border bg-card shadow-sm p-2 overflow-x-auto hide-scrollbar">
            <TabsList className="bg-transparent flex sm:grid sm:grid-cols-2 gap-2 h-auto min-w-max sm:min-w-0 p-0">
              <TabsTrigger value="records" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm text-muted-foreground hover:bg-muted/50 transition-all duration-200 rounded-xl text-xs font-bold uppercase tracking-wider"><Clock className="h-4 w-4" />Records</TabsTrigger>
              {isAdmin && <TabsTrigger value="config" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm text-muted-foreground hover:bg-muted/50 transition-all duration-200 rounded-xl text-xs font-bold uppercase tracking-wider"><Settings2 className="h-4 w-4" />Configuration</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="records" className="animate-fade-in"><OvertimeRecordsList /></TabsContent>
          {isAdmin && <TabsContent value="config" className="animate-fade-in"><OvertimeConfigPanel /></TabsContent>}
        </Tabs>

        <OvertimeEntryForm open={showEntryForm} onOpenChange={setShowEntryForm} />
      </div>
    </Dashboard>
  );
}
