import React from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { CheckCircle2, XCircle, AlertCircle, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PortalAttendance() {
  const { data, isLoading } = useEmployeePortalData();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const attendance = data?.attendance || [];
  
  // Calculate stats for the last 30 days
  const presentCount = attendance.filter((a: any) => a.status === 'present').length;
  const leaveCount = attendance.filter((a: any) => a.status === 'leave').length;
  const shortLeaveCount = attendance.filter((a: any) => a.status === 'short_leave').length;
  const absentCount = attendance.filter((a: any) => a.status === 'absent').length;
  
  const totalDays = attendance.length;
  const attendanceRate = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <h2 className="text-lg font-black tracking-tight text-foreground">Attendance</h2>
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <CalendarIcon className="w-3.5 h-3.5" /> Last 30 Days
        </span>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Present" value={presentCount} icon={CheckCircle2} colorClass="text-green-500 bg-green-500/10" />
        <StatCard title="Absent" value={absentCount} icon={XCircle} colorClass="text-red-500 bg-red-500/10" />
        <StatCard title="Leave" value={leaveCount} icon={AlertCircle} colorClass="text-yellow-500 bg-yellow-500/10" />
        <StatCard title="Short Leave" value={shortLeaveCount} icon={AlertCircle} colorClass="text-orange-500 bg-orange-500/10" />
      </div>

      {/* History List */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden mt-6">
        <div className="bg-muted/30 px-5 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold text-foreground">Recent Records</h3>
        </div>
        <CardContent className="p-0">
          {attendance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No attendance records found.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/30">
              {attendance.map((record: any) => (
                <div key={record.id} className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={record.status} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {format(parseISO(record.date), 'MMMM d, yyyy')}
                      </p>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
                        {format(parseISO(record.date), 'EEEE')}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={record.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, colorClass }: any) {
  return (
    <Card className="border-border/40 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className="p-4 flex flex-col gap-2">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-xl font-black text-foreground mt-0.5">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'present') return <div className="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>;
  if (status === 'absent') return <div className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center"><XCircle className="w-4 h-4" /></div>;
  if (status === 'leave') return <div className="w-8 h-8 rounded-full bg-yellow-500/10 text-yellow-500 flex items-center justify-center"><AlertCircle className="w-4 h-4" /></div>;
  return <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center"><AlertCircle className="w-4 h-4" /></div>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'present') return <span className="px-2.5 py-1 text-[10px] font-bold bg-green-500/10 text-green-600 rounded-full">PRESENT</span>;
  if (status === 'absent') return <span className="px-2.5 py-1 text-[10px] font-bold bg-red-500/10 text-red-600 rounded-full">ABSENT</span>;
  if (status === 'leave') return <span className="px-2.5 py-1 text-[10px] font-bold bg-yellow-500/10 text-yellow-600 rounded-full">LEAVE</span>;
  return <span className="px-2.5 py-1 text-[10px] font-bold bg-orange-500/10 text-orange-600 rounded-full text-center leading-tight">SHORT<br/>LEAVE</span>;
}
