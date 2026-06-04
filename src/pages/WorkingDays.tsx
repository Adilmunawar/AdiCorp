
import Dashboard from "@/components/layout/Dashboard";

import ShiftManagement from "@/components/settings/ShiftManagement";
import WorkingTimePolicies from "@/components/settings/WorkingTimePolicies";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Settings, Clock, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function WorkingDaysPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  if (!userProfile?.companies) {
    return (
      <Dashboard title="Working Days Configuration">
        <div className="text-center py-8">
          <Calendar className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Company Setup Required</h3>
          <p className="text-muted-foreground mb-4">You need to complete company setup before configuring working days.</p>
          <Button onClick={() => navigate('/settings')}>Go to Settings</Button>
        </div>
      </Dashboard>
    );
  }

  return (
    <Dashboard title="Shift Management">
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-5 bg-muted/5 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" /> Day Management Center
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Configure work schedules, monthly day rules, shifts, and time policies from one streamlined workspace.</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="shifts" className="space-y-4">
          <div className="rounded-2xl border border-border bg-card shadow-sm p-2 overflow-x-auto hide-scrollbar">
            <TabsList className="bg-transparent flex sm:grid sm:grid-cols-2 gap-2 h-auto min-w-max sm:min-w-0 p-0">
              <TabsTrigger value="shifts" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground hover:bg-muted/50 data-[state=active]:hover:bg-primary/90 transition-all duration-300 rounded-xl text-xs font-bold uppercase tracking-wider">
                <Clock className="mr-2 h-4 w-4" /> Shift Management
              </TabsTrigger>
              <TabsTrigger value="policies" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground hover:bg-muted/50 data-[state=active]:hover:bg-primary/90 transition-all duration-300 rounded-xl text-xs font-bold uppercase tracking-wider">
                <Shield className="mr-2 h-4 w-4" /> Time Policies
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="shifts"><ShiftManagement /></TabsContent>
          <TabsContent value="policies"><WorkingTimePolicies /></TabsContent>
        </Tabs>
      </div>
    </Dashboard>
  );
}
