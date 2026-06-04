import React, { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { format, subDays, eachDayOfInterval, startOfToday, parseISO, isSameDay, startOfMonth, endOfMonth, addMonths, isSameMonth } from "date-fns";
import PortalAttendance from "./PortalAttendance";
import PortalPayroll from "./PortalPayroll";
import PortalReports from "./PortalReports";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export default function PortalRecords() {
  const [activeTab, setActiveTab] = useState("attendance");
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(startOfToday()));
  const { data } = useEmployeePortalData();
  
  const attendance = data?.attendance || [];

  const handlePrevMonth = () => setSelectedMonth(prev => addMonths(prev, -1));
  const handleNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const isCurrentMonth = isSameMonth(selectedMonth, startOfToday());

  const currentMonthAttendance = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    return attendance.filter((a: any) => {
      const date = parseISO(a.date);
      return date >= start && date <= end;
    });
  }, [attendance, selectedMonth]);

  const presentCount = currentMonthAttendance.filter((a: any) => a.status === 'present').length;
  const leaveCount = currentMonthAttendance.filter((a: any) => a.status === 'leave').length;
  const shortLeaveCount = currentMonthAttendance.filter((a: any) => a.status === 'short_leave').length;
  const absentCount = currentMonthAttendance.filter((a: any) => a.status === 'absent').length;

  const activityGraphData = useMemo(() => {
    const end = startOfToday();
    const start = subDays(end, 89); // 90 days total
    const days = eachDayOfInterval({ start, end });

    return days.map(day => {
      const record = attendance.find((a: any) => isSameDay(parseISO(a.date), day));
      return {
        date: day,
        status: record ? record.status : 'none'
      };
    });
  }, [attendance]);

  const getColorClass = (status: string) => {
    switch (status) {
      case 'present': return 'bg-emerald-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-emerald-600/20';
      case 'absent': return 'bg-red-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-red-600/20';
      case 'leave': return 'bg-amber-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-amber-500/20';
      case 'short_leave': return 'bg-orange-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-orange-600/20';
      default: return 'bg-muted border border-border/30 shadow-inner';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-8">
      <div className="px-2 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">My Workspace</h2>
          <p className="text-xs text-muted-foreground mt-1 font-medium">Track your attendance activity and access your records.</p>
        </div>
      </div>

      {/* Monthly Stats */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-extrabold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Monthly Overview
          </h3>
          <div className="flex items-center gap-1 bg-muted/30 rounded-full p-1 border border-border/50">
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-background shadow-sm" onClick={handlePrevMonth}>
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span className="text-[10px] font-bold uppercase tracking-widest w-20 text-center">{format(selectedMonth, 'MMM yyyy')}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-background shadow-sm" onClick={handleNextMonth} disabled={isCurrentMonth}>
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-3 flex flex-col items-center justify-center text-center shadow-sm hover:scale-105 transition-transform">
            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 opacity-80">Present</p>
            <p className="text-xl font-black text-emerald-700 tracking-tighter">{presentCount}</p>
          </div>
          <div className="bg-amber-400/10 border border-amber-500/20 rounded-3xl p-3 flex flex-col items-center justify-center text-center shadow-sm hover:scale-105 transition-transform">
            <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1 opacity-80">Leave</p>
            <p className="text-xl font-black text-amber-700 tracking-tighter">{leaveCount}</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-3xl p-3 flex flex-col items-center justify-center text-center shadow-sm hover:scale-105 transition-transform">
            <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest leading-none mb-1 opacity-80">Short<br/>Leave</p>
            <p className="text-xl font-black text-orange-700 tracking-tighter">{shortLeaveCount}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-3 flex flex-col items-center justify-center text-center shadow-sm hover:scale-105 transition-transform">
            <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1 opacity-80">Absent</p>
            <p className="text-xl font-black text-red-700 tracking-tighter">{absentCount}</p>
          </div>
        </div>
      </div>

      {/* GitHub Style Activity Graph */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-card to-muted/20 rounded-[2rem] overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-extrabold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Activity Heatmap
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-3 py-1 rounded-full">Past 90 Days</span>
          </div>
          
          <div className="w-full overflow-x-auto pb-2 scrollbar-none">
            <div className="min-w-max grid grid-rows-7 grid-flow-col gap-1.5 p-1">
              {activityGraphData.map((dayData, i) => (
                <TooltipProvider key={i}>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <div className={`w-3.5 h-3.5 rounded-[3px] transition-transform hover:scale-125 hover:ring-2 ring-primary/30 z-10 ${getColorClass(dayData.status)}`} />
                    </TooltipTrigger>
                    <TooltipContent className="bg-foreground text-background border-none rounded-xl px-3 py-1.5 font-semibold text-xs shadow-xl">
                      <p>{format(dayData.date, 'MMM d, yyyy')}</p>
                      <p className="text-[10px] text-muted capitalize opacity-80 mt-0.5">{dayData.status === 'none' ? 'No Record' : dayData.status.replace('_', ' ')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border/40">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Legend</span>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold"><div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500" /> Present</div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold"><div className="w-2.5 h-2.5 rounded-[2px] bg-amber-400" /> Leave</div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold"><div className="w-2.5 h-2.5 rounded-[2px] bg-red-500" /> Absent</div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-[52px] bg-card shadow-lg border border-border/40 rounded-2xl p-1.5 mb-6">
          <TabsTrigger value="attendance" className="rounded-xl text-xs font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
            <Clock className="w-4 h-4 mr-1.5" /> Time
          </TabsTrigger>
          <TabsTrigger value="payroll" className="rounded-xl text-xs font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
            <DollarSign className="w-4 h-4 mr-1.5" /> Pay
          </TabsTrigger>
          <TabsTrigger value="documents" className="rounded-xl text-xs font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
            <ShieldCheck className="w-4 h-4 mr-1.5" /> Docs
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="attendance" className="mt-0 outline-none animate-in fade-in zoom-in-95 duration-300">
          <PortalAttendance />
        </TabsContent>
        <TabsContent value="payroll" className="mt-0 outline-none animate-in fade-in zoom-in-95 duration-300">
          <PortalPayroll />
        </TabsContent>
        <TabsContent value="documents" className="mt-0 outline-none animate-in fade-in zoom-in-95 duration-300">
          <PortalReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}
