import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PortalAttendance from "./PortalAttendance";
import PortalPayroll from "./PortalPayroll";
import PortalReports from "./PortalReports";
import { Clock, DollarSign, ShieldCheck } from "lucide-react";

export default function PortalRecords() {
  const [activeTab, setActiveTab] = useState("attendance");

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-8">
      <div className="px-2 mb-2">
        <h2 className="text-xl font-black tracking-tight text-foreground">My Records</h2>
        <p className="text-xs text-muted-foreground mt-1">View your attendance, payslips, and compliance documents.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-12 bg-muted/50 rounded-2xl p-1 mb-6">
          <TabsTrigger value="attendance" className="rounded-xl text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Time
          </TabsTrigger>
          <TabsTrigger value="payroll" className="rounded-xl text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <DollarSign className="w-3.5 h-3.5 mr-1.5" /> Pay
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-xl text-xs font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Docs
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="attendance" className="mt-0 outline-none">
          <PortalAttendance />
        </TabsContent>
        <TabsContent value="payroll" className="mt-0 outline-none">
          <PortalPayroll />
        </TabsContent>
        <TabsContent value="documents" className="mt-0 outline-none">
          <PortalReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}
