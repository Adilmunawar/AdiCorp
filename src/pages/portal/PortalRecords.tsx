import React, { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { format, subDays, eachDayOfInterval, startOfToday, parseISO, isSameDay, startOfMonth, endOfMonth, addMonths, isSameMonth } from "date-fns";
import PortalAttendance from "./PortalAttendance";
import PortalPayroll from "./PortalPayroll";
import PortalReports from "./PortalReports";
import PortalOvertime from "./PortalOvertime";
import { Activity, ChevronLeft, ChevronRight, Clock, Clock3, DollarSign, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export default function PortalRecords() {
  const [activeTab, setActiveTab] = useState("attendance");
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(startOfToday()));
  const { data } = useEmployeePortalData();
  
  const attendance = data?.attendance || [];
  const events = (data as any)?.events || [];
  const leaveRequests = (data as any)?.leave_requests || [];

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
  // Make sure not to count absent if it falls on an event
  const absentCount = currentMonthAttendance.filter((a: any) => {
    if (a.status !== 'absent') return false;
    const isEvent = events.some((e: any) => isSameDay(parseISO(e.date), parseISO(a.date)));
    return !isEvent;
  }).length;

  const activityGraphData = useMemo(() => {
    const end = startOfToday();
    const start = subDays(end, 89); // 90 days total
    const days = eachDayOfInterval({ start, end });

    return days.map(day => {
      const record = attendance.find((a: any) => isSameDay(parseISO(a.date), day));
      const isEvent = events.some((e: any) => isSameDay(parseISO(e.date), day));
      
      return {
        date: day,
        status: isEvent ? 'event' : (record ? record.status : 'none'),
        eventDetails: isEvent ? events.find((e: any) => isSameDay(parseISO(e.date), day)) : null
      };
    });
  }, [attendance, events]);

  const getColorClass = (status: string) => {
    switch (status) {
      case 'present': return 'bg-emerald-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-emerald-600/20';
      case 'absent': return 'bg-red-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-red-600/20';
      case 'leave': return 'bg-amber-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-amber-500/20';
      case 'short_leave': return 'bg-orange-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-orange-600/20';
      case 'event': return 'bg-yellow-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] border border-yellow-500/20 animate-pulse';
      default: return 'bg-muted border border-border/30 shadow-inner';
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Monthly Stats */}
      <div className="space-y-2.5 mt-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 pl-2 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Monthly Overview
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> Activity Heatmap
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
                      <p className="text-[10px] text-muted capitalize opacity-80 mt-0.5">
                        {dayData.status === 'none' ? 'No Record' : 
                         dayData.status === 'event' && dayData.eventDetails ? `Event: ${(dayData.eventDetails as any).title}` : 
                         dayData.status.replace('_', ' ')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border/40 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Legend</span>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold"><div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500" /> Present</div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold"><div className="w-2.5 h-2.5 rounded-[2px] bg-amber-400" /> Leave</div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold"><div className="w-2.5 h-2.5 rounded-[2px] bg-red-500" /> Absent</div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold"><div className="w-2.5 h-2.5 rounded-[2px] bg-yellow-400" /> Event</div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full h-auto min-h-[52px] bg-card shadow-lg border border-border/40 rounded-2xl p-1.5 mb-6 overflow-x-auto scrollbar-none snap-x shrink-0 justify-start md:grid md:grid-cols-4 gap-1 sm:gap-0">
          <TabsTrigger value="attendance" className="flex-1 shrink-0 min-w-[80px] md:min-w-0 rounded-xl text-[10px] sm:text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Time
          </TabsTrigger>
          <TabsTrigger value="payroll" className="flex-1 shrink-0 min-w-[80px] md:min-w-0 rounded-xl text-[10px] sm:text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Pay
          </TabsTrigger>
          <TabsTrigger value="overtime" className="flex-1 shrink-0 min-w-[90px] md:min-w-0 rounded-xl text-[10px] sm:text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Clock3 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Overtime
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex-1 shrink-0 min-w-[80px] md:min-w-0 rounded-xl text-[10px] sm:text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Docs
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="attendance" className="mt-0 outline-none animate-in fade-in zoom-in-95 duration-300">
          <PortalAttendance />
        </TabsContent>
        <TabsContent value="payroll" className="mt-0 outline-none animate-in fade-in zoom-in-95 duration-300">
          <PortalPayroll />
        </TabsContent>
        <TabsContent value="overtime" className="mt-0 outline-none animate-in fade-in zoom-in-95 duration-300">
          <PortalOvertime />
        </TabsContent>
        <TabsContent value="documents" className="mt-0 outline-none animate-in fade-in zoom-in-95 duration-300">
          <PortalReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}
