import React, { useState } from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { CheckCircle2, XCircle, AlertCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PortalAttendance() {
  const { data, isLoading } = useEmployeePortalData();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

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

  const totalPages = Math.ceil(attendance.length / itemsPerPage);
  const paginatedAttendance = attendance.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
      <div className="flex items-center justify-between px-1 mb-1">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 pl-2">Attendance History</h3>
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
          <CalendarIcon className="w-3 h-3" /> All Records
        </span>
      </div>

      {/* History List */}
      <Card className="border-border/40 shadow-lg rounded-[2rem] overflow-hidden mt-6 bg-card/60 backdrop-blur-sm">
        <div className="bg-muted/30 px-5 py-3.5 border-b border-border/40">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">Recent Records</h3>
        </div>
        <CardContent className="p-0">
          {attendance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm font-medium">
              No attendance records found.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/30">
              {paginatedAttendance.map((record: any) => (
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
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 bg-muted/10 border-t border-border/40">
            <span className="text-xs font-bold text-muted-foreground tracking-tight">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-xl border-border/50 hover:bg-muted"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-xl border-border/50 hover:bg-muted"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
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
