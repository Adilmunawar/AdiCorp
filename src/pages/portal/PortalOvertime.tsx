import React, { useState } from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";

export default function PortalOvertime() {
  const { data, isLoading } = useEmployeePortalData();
  const [page, setPage] = useState(1);
  const itemsPerPage = 8; // Small chunk to keep UI fast

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
      </div>
    );
  }

  const overtimeRecords = (data as any)?.overtime_records || [];
  
  const totalPages = Math.ceil(overtimeRecords.length / itemsPerPage);
  const displayRecords = overtimeRecords.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const getStatusConfig = (status: string) => {
    switch(status.toLowerCase()) {
      case 'approved': return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
      case 'rejected': return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' };
      default: return { icon: Clock3, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
      <div className="flex items-center justify-between px-1 mb-1">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 pl-2">Overtime Records</h3>
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
          <Clock className="w-3 h-3" /> All History
        </span>
      </div>

      {overtimeRecords.length === 0 ? (
        <Card className="border-border/40 shadow-sm rounded-[2rem] bg-muted/10">
          <CardContent className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
              <Clock className="w-6 h-6 opacity-40" />
            </div>
            <p className="font-semibold">No overtime records found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayRecords.map((record: any) => {
            const statusConfig = getStatusConfig(record.status);
            const StatusIcon = statusConfig.icon;
            
            return (
              <Card key={record.id} className="border border-border/40 shadow-sm hover:shadow-md rounded-[1.5rem] overflow-hidden transition-all duration-300 bg-card/60 hover:bg-card">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}>
                      <StatusIcon className="w-6 h-6" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground tracking-tight">
                        {format(parseISO(record.date), 'MMMM dd, yyyy')}
                      </p>
                      <p className="text-[11px] font-bold tracking-wide mt-0.5 text-muted-foreground capitalize">
                        {record.overtime_type.replace('_', ' ')} • {record.multiplier}x Rate
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${statusConfig.color}`}>
                      {record.status}
                    </p>
                    <p className="text-sm font-black text-foreground tracking-tight">
                      {record.hours} <span className="opacity-70 text-xs">Hrs</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full shadow-sm"
              >
                Previous
              </Button>
              <span className="text-xs font-bold text-muted-foreground">Page {page} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-full shadow-sm"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
