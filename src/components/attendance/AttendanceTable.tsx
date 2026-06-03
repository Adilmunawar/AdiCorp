
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save } from "lucide-react";
import { EmployeeRow } from "@/types/supabase";
import { useNavigate } from "react-router-dom";
import { AttendanceDatePanel } from "@/components/attendance/AttendanceDatePanel";
import { AttendanceSummaryPanel } from "@/components/attendance/AttendanceSummaryPanel";
import { ATTENDANCE_STATUS_OPTIONS, AttendanceRecord, AttendanceStatusValue } from "@/components/attendance/types";

const isAttendanceStatus = (value: string): value is AttendanceStatusValue => {
  return ["present", "short_leave", "leave", "not_set"].includes(value);
};

export default function AttendanceTable() {
  const [date, setDate] = useState<Date>(new Date());
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchEmployees = async () => {
    try {
      if (!userProfile?.company_id) return;
      const { data, error } = await supabase.from('employees').select('*').eq('company_id', userProfile.company_id).eq('status', 'active').order('name');
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      toast({ title: "Error fetching employees", description: "Please try again.", variant: "destructive" });
    }
  };

  const fetchAttendance = async (selectedDate: Date) => {
    try {
      if (!userProfile?.company_id) return;
      if (employees.length === 0) {
        setAttendanceData([]);
        return;
      }

      const dateString = selectedDate.toISOString().split('T')[0];
      const employeeIds = employees.map(emp => emp.id);
      const { data: attendanceRecords, error } = await supabase.from('attendance').select('*').eq('date', dateString).in('employee_id', employeeIds);
      if (error && error.code !== 'PGRST116') throw error;
      const attendanceMap = new Map((attendanceRecords || []).map(record => [record.employee_id, record]));
      const data = employees.map(employee => {
        const existingRecord = attendanceMap.get(employee.id);
        const normalizedStatus = existingRecord?.status && isAttendanceStatus(existingRecord.status)
          ? existingRecord.status
          : "not_set";

        return { id: existingRecord?.id, employeeId: employee.id, employeeName: employee.name, date: dateString, status: normalizedStatus };
      });
      setAttendanceData(data);
    } catch (error) {
      toast({ title: "Error fetching attendance", description: "Please try again.", variant: "destructive" });
    }
  };

  useEffect(() => {
    const loadData = async () => { setLoading(true); await fetchEmployees(); setLoading(false); };
    if (userProfile?.company_id) loadData();
    else setLoading(false);
  }, [userProfile?.company_id]);

  useEffect(() => {
    if (userProfile?.company_id) {
      fetchAttendance(date);
    }
  }, [employees, date, userProfile?.company_id]);

  const handleDateChange = (newDate: Date) => setDate(newDate);
  const handleStatusChange = (employeeId: string, status: AttendanceStatusValue) => {
    setAttendanceData(prev => prev.map(item => item.employeeId === employeeId ? { ...item, status } : item));
  };
  const applyStatusToAll = (status: AttendanceStatusValue) => {
    setAttendanceData((prev) => prev.map((item) => ({ ...item, status })));
  };

  const saveAttendance = async () => {
    try {
      setSaving(true);
      const updates = attendanceData.filter(record => record.status !== 'not_set').map(record => ({ employee_id: record.employeeId, date: record.date, status: record.status }));
      if (updates.length === 0) { toast({ title: "No attendance to save", description: "Please mark attendance for at least one employee.", variant: "destructive" }); return; }
      const { error } = await supabase.from('attendance').upsert(updates, { onConflict: 'employee_id,date', ignoreDuplicates: false });
      if (error) throw error;
      toast({ title: "Attendance saved", description: `Saved attendance for ${updates.length} employees.` });
      await fetchAttendance(date);
    } catch (error) { toast({ title: "Error saving attendance", description: "Please try again.", variant: "destructive" }); }
    finally { setSaving(false); }
  };
  
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'present': return <Badge variant="default">Present</Badge>;
      case 'short_leave': return <Badge variant="secondary">Short Leave</Badge>;
      case 'leave': return <Badge variant="destructive">Leave</Badge>;
      default: return <Badge className="bg-muted text-muted-foreground">Not Set</Badge>;
    }
  };

  const employeeRankMap = useMemo(() => {
    return new Map(employees.map((employee) => [employee.id, employee.rank]));
  }, [employees]);

  const summary = useMemo(() => {
    const present = attendanceData.filter((record) => record.status === "present").length;
    const shortLeave = attendanceData.filter((record) => record.status === "short_leave").length;
    const leave = attendanceData.filter((record) => record.status === "leave").length;
    const notSet = attendanceData.filter((record) => record.status === "not_set").length;

    return { present, shortLeave, leave, notSet };
  }, [attendanceData]);

  if (loading) {
    return (<div className="flex justify-center items-center py-8"><div className="flex items-center space-x-2"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="text-muted-foreground">Loading employees...</span></div></div>);
  }

  if (!userProfile?.company_id) {
    return (
      <div className="text-center py-8 space-y-4">
        <p className="text-muted-foreground">Please complete company setup before marking attendance.</p>
        <Button variant="outline" onClick={() => navigate('/settings')}>Go to Settings</Button>
      </div>
    );
  }

  if (employees.length === 0) {
    return (<div className="text-center py-8"><p className="text-muted-foreground">No active employees found. Please add employees first.</p></div>);
  }
  
  return (
    <div className="space-y-4">
      <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-3 px-4 bg-muted/5 border-b border-border/50">
          <div>
            <CardTitle className="text-base text-foreground font-bold">Daily Attendance Tracker</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">Mark, review, and save attendance with clear daily status visibility.</p>
          </div>
          <Button onClick={saveAttendance} disabled={saving} className="h-8 text-xs rounded-lg shadow-sm font-semibold">
            {saving ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving...</>) : (<><Save className="h-3.5 w-3.5 mr-1.5" />Save Attendance</>)}
          </Button>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <AttendanceDatePanel date={date} onDateChange={handleDateChange} />
        <AttendanceSummaryPanel date={date} summary={summary} totalEmployees={employees.length} />
      </div>

      <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-4 bg-muted/5 border-b border-border/50">
          <div>
            <CardTitle className="text-sm font-bold text-foreground">Employee Attendance Matrix</CardTitle>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Use quick actions to mark everyone, then adjust individual records if needed.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 bg-background p-1 rounded-xl border border-border/50 shadow-sm">
            <span className="text-[9px] uppercase font-bold text-muted-foreground px-2">Apply to all</span>
            <div className="h-4 w-[1px] bg-border/50 mx-0.5"></div>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] rounded-md px-2 hover:bg-green-500/10 hover:text-green-600" onClick={() => applyStatusToAll("present")}>Present</Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] rounded-md px-2 hover:bg-amber-500/10 hover:text-amber-600" onClick={() => applyStatusToAll("short_leave")}>Short Leave</Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] rounded-md px-2 hover:bg-red-500/10 hover:text-red-600" onClick={() => applyStatusToAll("leave")}>Leave</Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] rounded-md px-2 hover:bg-slate-500/10" onClick={() => applyStatusToAll("not_set")}>Reset</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[500px]">
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border/50 hover:bg-transparent h-8">
                  <TableHead className="py-1 pl-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employee</TableHead>
                  <TableHead className="py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Position</TableHead>
                  <TableHead className="py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceData.map((record) => (
                  <TableRow key={record.employeeId} className="border-border/30 hover:bg-muted/10 transition-colors h-10">
                    <TableCell className="pl-4 py-1">
                      <p className="font-semibold text-xs text-foreground leading-tight">{record.employeeName}</p>
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge variant="outline" className="text-[9px] bg-background shadow-sm px-1.5 py-0 h-4">{employeeRankMap.get(record.employeeId) || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell className="py-1">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 border border-border/60 rounded-lg p-0.5 bg-muted/10 shadow-sm w-fit">
                          <button 
                            onClick={() => handleStatusChange(record.employeeId, 'present')} 
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${record.status === 'present' ? 'bg-green-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                          >Present</button>
                          <button 
                            onClick={() => handleStatusChange(record.employeeId, 'short_leave')} 
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${record.status === 'short_leave' ? 'bg-amber-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                          >Short</button>
                          <button 
                            onClick={() => handleStatusChange(record.employeeId, 'leave')} 
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${record.status === 'leave' ? 'bg-red-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                          >Leave</button>
                          <button 
                            onClick={() => handleStatusChange(record.employeeId, 'not_set')} 
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${record.status === 'not_set' ? 'bg-slate-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                          >Unset</button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
