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
        <h2 className="text-lg font-black tracking-tight text-foreground">Attendance History</h2>
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <CalendarIcon className="w-3.5 h-3.5" /> All Records
        </span>
      </div>

      {/* History List */}
      <Card className="border-border/40 shadow-lg rounded-[2rem] overflow-hidden mt-6 bg-card/60 backdrop-blur-sm">
        <div className="bg-muted/30 px-6 py-4 border-b border-border/40">
          <h3 className="text-sm font-extrabold text-foreground tracking-tight">Recent Records</h3>
        </div>
        <CardContent className="p-0">
          {attendance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm font-medium">
              No attendance records found.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/30">
              {attendance.map((record: any) => (
                <div key={record.id} className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <StatusIcon status={record.status} />
                    <div>
                      <p className="text-sm font-black text-foreground tracking-tight">
                        {format(parseISO(record.date), 'MMMM d, yyyy')}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
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
    <Card className={`border shadow-sm rounded-3xl overflow-hidden bg-card/40 backdrop-blur-sm transition-transform hover:scale-[1.02] active:scale-[0.98] ${colorClass.split(' ').find(c => c.startsWith('border-'))}`}>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]", colorClass.split(' ').slice(0, 2).join(' '))}>
          <Icon className="w-5 h-5" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
          <p className="text-2xl font-black text-foreground mt-1 tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'present') return <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-500/20"><CheckCircle2 className="w-5 h-5" /></div>;
  if (status === 'absent') return <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center shadow-sm border border-red-500/20"><XCircle className="w-5 h-5" /></div>;
  if (status === 'leave') return <div className="w-10 h-10 rounded-2xl bg-amber-400/10 text-amber-600 flex items-center justify-center shadow-sm border border-amber-500/20"><AlertCircle className="w-5 h-5" /></div>;
  return <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 flex items-center justify-center shadow-sm border border-orange-500/20"><AlertCircle className="w-5 h-5" /></div>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'present') return <span className="px-3 py-1.5 text-[10px] font-black bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20 tracking-widest shadow-sm">PRESENT</span>;
  if (status === 'absent') return <span className="px-3 py-1.5 text-[10px] font-black bg-red-500/10 text-red-600 rounded-full border border-red-500/20 tracking-widest shadow-sm">ABSENT</span>;
  if (status === 'leave') return <span className="px-3 py-1.5 text-[10px] font-black bg-amber-400/10 text-amber-600 rounded-full border border-amber-500/20 tracking-widest shadow-sm">LEAVE</span>;
  return <span className="px-3 py-1.5 text-[10px] font-black bg-orange-500/10 text-orange-600 rounded-full border border-orange-500/20 text-center leading-tight tracking-widest shadow-sm">SHORT<br/>LEAVE</span>;
}
