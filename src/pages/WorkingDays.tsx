
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
    <Dashboard title="Advanced Working Days & Time Management">
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-foreground">Day Management Center</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure work schedules, monthly day rules, shifts, and time policies from one streamlined workspace.
          </p>
        </div>

        <Tabs defaultValue="shifts" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 p-1">
            <TabsTrigger value="shifts" className="px-3 py-2 text-xs sm:text-sm">
              <Clock className="mr-2 h-4 w-4" />
              Shift Management
            </TabsTrigger>
            <TabsTrigger value="policies" className="px-3 py-2 text-xs sm:text-sm">
              <Shield className="mr-2 h-4 w-4" />
              Time Policies
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shifts"><ShiftManagement /></TabsContent>
          <TabsContent value="policies"><WorkingTimePolicies /></TabsContent>
        </Tabs>
      </div>
    </Dashboard>
  );
}
