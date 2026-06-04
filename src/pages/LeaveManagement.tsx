import { useState } from "react";
import Dashboard from "@/components/layout/Dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Settings2, BarChart3 } from "lucide-react";
import LeaveRequestsList from "@/components/leave/LeaveRequestsList";
import LeaveRequestForm from "@/components/leave/LeaveRequestForm";
import LeaveTypesConfig from "@/components/leave/LeaveTypesConfig";
import LeaveBalanceOverview from "@/components/leave/LeaveBalanceOverview";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";

export default function LeaveManagement() {
  const [activeTab, setActiveTab] = useState("requests");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.is_admin;

  return (
    <Dashboard title="Leave Management">
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-5 bg-muted/5 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" /> Leave Management
                </h2>
                {isAdmin && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Admin View</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Manage leave requests, balances, and leave policies in one streamlined workspace.</p>
            </div>
            <Button onClick={() => setShowRequestForm(true)} className="h-9 text-xs rounded-lg shadow-sm font-semibold w-full sm:w-auto">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Leave Request
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="rounded-2xl border border-border bg-card shadow-sm p-2 overflow-x-auto hide-scrollbar">
            <TabsList className="bg-transparent flex sm:grid sm:grid-cols-3 gap-2 h-auto min-w-max sm:min-w-0 p-0">
              <TabsTrigger value="requests" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground hover:bg-muted/50 data-[state=active]:hover:bg-primary/90 transition-all duration-300 rounded-xl text-xs font-bold uppercase tracking-wider">
                <CalendarDays className="h-4 w-4" /> Requests
              </TabsTrigger>
              <TabsTrigger value="balances" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground hover:bg-muted/50 data-[state=active]:hover:bg-primary/90 transition-all duration-300 rounded-xl text-xs font-bold uppercase tracking-wider">
                <BarChart3 className="h-4 w-4" /> Balances
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="config" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground hover:bg-muted/50 data-[state=active]:hover:bg-primary/90 transition-all duration-300 rounded-xl text-xs font-bold uppercase tracking-wider">
                  <Settings2 className="h-4 w-4" /> Leave Types
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="requests" className="animate-fade-in">
            <LeaveRequestsList />
          </TabsContent>

          <TabsContent value="balances" className="animate-fade-in">
            <LeaveBalanceOverview />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="config" className="animate-fade-in">
              <LeaveTypesConfig />
            </TabsContent>
          )}
        </Tabs>

        <LeaveRequestForm open={showRequestForm} onOpenChange={setShowRequestForm} />
      </div>
    </Dashboard>
  );
}
