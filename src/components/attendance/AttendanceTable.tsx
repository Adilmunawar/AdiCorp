
import { useState, useEffect, useMemo } from "react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Calendar as CalendarIcon, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { EmployeeRow } from "@/types/supabase";
import { useNavigate } from "react-router-dom";
import { ATTENDANCE_STATUS_OPTIONS, AttendanceRecord, AttendanceStatusValue } from "@/components/attendance/types";

const isAttendanceStatus = (value: string): value is AttendanceStatusValue => {
  return ["present", "short_leave", "absent"].includes(value);
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
          : "absent";

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
    if (date.getDay() === 0) {
      toast({ title: "Off-Day", description: "Attendance cannot be saved on a Sunday.", variant: "destructive" });
      return;
    }
    try {
      setSaving(true);
      const updates = attendanceData.map(record => ({ employee_id: record.employeeId, date: record.date, status: record.status }));
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
      case 'absent': return <Badge variant="destructive">Absent</Badge>;
      default: return null;
    }
  };

  const employeeRankMap = useMemo(() => {
    return new Map(employees.map((employee) => [employee.id, employee.rank]));
  }, [employees]);

  const summary = useMemo(() => {
    const present = attendanceData.filter((record) => record.status === "present").length;
    const shortLeave = attendanceData.filter((record) => record.status === "short_leave").length;
    const absent = attendanceData.filter((record) => record.status === "absent").length;

    return { present, shortLeave, absent };
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
      <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden mb-4">
        <CardHeader className="flex flex-col gap-4 py-4 px-5 bg-muted/5 border-b border-border/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-foreground font-bold flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Daily Attendance
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Manage and track your daily workforce attendance.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-background border border-border/50 rounded-lg p-1 shadow-sm">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleDateChange(addDays(date, -1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className={cn("h-7 px-3 text-[11px] font-semibold", !date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {date ? format(date, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(selected) => selected && handleDateChange(selected)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleDateChange(addDays(date, 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
              
              <Button onClick={saveAttendance} disabled={saving} className="h-9 text-xs rounded-lg shadow-sm font-semibold ml-2">
                {saving ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving...</>) : (<><Save className="h-3.5 w-3.5 mr-1.5" />Save</>)}
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-border/30">
            <div className="bg-background border border-border/40 rounded-lg p-2 flex flex-col justify-center shadow-sm">
              <span className="text-[9px] uppercase font-bold text-muted-foreground">Coverage</span>
              <div className="flex items-end gap-1 mt-0.5">
                <span className="text-sm font-bold">{employees.length > 0 ? Math.round(((summary.present + summary.shortLeave) / employees.length) * 100) : 0}%</span>
              </div>
            </div>
            <div className="bg-background border border-green-500/20 rounded-lg p-2 flex flex-col justify-center shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-8 h-8 bg-green-500/10 rounded-bl-full" />
              <span className="text-[9px] uppercase font-bold text-muted-foreground">Present</span>
              <span className="text-sm font-bold text-green-600 mt-0.5">{summary.present}</span>
            </div>
            <div className="bg-background border border-amber-500/20 rounded-lg p-2 flex flex-col justify-center shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-8 h-8 bg-amber-500/10 rounded-bl-full" />
              <span className="text-[9px] uppercase font-bold text-muted-foreground">Short Leave</span>
              <span className="text-sm font-bold text-amber-600 mt-0.5">{summary.shortLeave}</span>
            </div>
            <div className="bg-background border border-red-500/20 rounded-lg p-2 flex flex-col justify-center shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-8 h-8 bg-red-500/10 rounded-bl-full" />
              <span className="text-[9px] uppercase font-bold text-muted-foreground">Absent</span>
              <span className="text-sm font-bold text-red-600 mt-0.5">{summary.absent}</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden mt-4">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-4 bg-muted/5 border-b border-border/50">
          <div>
            <CardTitle className="text-sm font-bold text-foreground">Employee Attendance Matrix</CardTitle>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Use quick actions to mark everyone, then adjust individual records if needed.</p>
          </div>
          
          {date.getDay() === 0 ? (
            <div className="bg-amber-500/10 text-amber-600 border border-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5" /> Sunday is a designated Off-Day. Attendance tracking is disabled.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 bg-background p-1 rounded-xl border border-border/50 shadow-sm">
              <span className="text-[9px] uppercase font-bold text-muted-foreground px-2">Apply to all</span>
              <div className="h-4 w-[1px] bg-border/50 mx-0.5"></div>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] rounded-md px-2 hover:bg-green-500/10 hover:text-green-600" onClick={() => applyStatusToAll("present")}>Present</Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] rounded-md px-2 hover:bg-amber-500/10 hover:text-amber-600" onClick={() => applyStatusToAll("short_leave")}>Short Leave</Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] rounded-md px-2 hover:bg-red-500/10 hover:text-red-600" onClick={() => applyStatusToAll("absent")}>Absent</Button>
            </div>
          )}
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
                        {date.getDay() === 0 ? (
                          <div className="flex items-center gap-0.5 border border-border/60 rounded-lg p-0.5 bg-muted shadow-sm w-fit opacity-50 cursor-not-allowed">
                            <span className="px-3 py-1 text-[10px] font-bold text-muted-foreground">Disabled (Off-Day)</span>
                          </div>
                        ) : (
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
                              onClick={() => handleStatusChange(record.employeeId, 'absent')} 
                              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${record.status === 'absent' ? 'bg-red-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                            >Absent</button>
                          </div>
                        )}
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
