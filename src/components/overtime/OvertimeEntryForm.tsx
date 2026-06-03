import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface OvertimeEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OvertimeEntryForm({ open, onOpenChange }: OvertimeEntryFormProps) {
  const { userProfile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [overtimeConfig, setOvertimeConfig] = useState<any>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState<Date>();
  const [hours, setHours] = useState("");
  const [overtimeType, setOvertimeType] = useState("regular");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && userProfile?.company_id) {
      fetchData();
    }
  }, [open, userProfile?.company_id]);

  const fetchData = async () => {
    try {
      const [empRes, tierRes] = await Promise.all([
        supabase.from("employees").select("id, name, tier, wage_rate, salary_divisor, working_hours_per_day").eq("company_id", userProfile!.company_id!).eq("status", "active").order("name"),
        supabase.from("overtime_config").select("*").eq("company_id", userProfile!.company_id!).maybeSingle(),
      ]);

      if (empRes.error) throw empRes.error;
      if (tierRes.error) throw tierRes.error;

      setEmployees(empRes.data || []);
      setOvertimeConfig(tierRes.data || null);
    } catch (error: any) {
      toast({ title: "Failed to load overtime form data", description: error.message, variant: "destructive" });
    }
  };

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const multiplier = overtimeConfig
    ? overtimeType === "weekend" ? Number(overtimeConfig.weekend_multiplier || 2.0)
    : overtimeType === "holiday" ? Number(overtimeConfig.holiday_multiplier || 2.5)
    : Number(overtimeConfig.regular_multiplier || 1.5)
    : 1.5;

  const hourlyRate = selectedEmployee
    ? Number(selectedEmployee.wage_rate) / (Number(selectedEmployee.salary_divisor || 26)) / (Number(selectedEmployee.working_hours_per_day || 8))
    : 0;

  const totalAmount = Number(hours || 0) * hourlyRate * multiplier;

  const handleSubmit = async () => {
    if (!employeeId || !date || !hours) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("overtime_records").insert({
        employee_id: employeeId,
        company_id: userProfile!.company_id!,
        date: format(date, "yyyy-MM-dd"),
        hours: Number(hours),
        hourly_rate: hourlyRate,
        multiplier,
        total_amount: totalAmount,
        overtime_type: overtimeType,
        reason,
        requested_by: user?.id,
        status: "pending",
      });
      if (error) throw error;
      toast({ title: "Overtime entry submitted" });
      queryClient.invalidateQueries({ queryKey: ["overtime-records"] });
      onOpenChange(false);
      setEmployeeId(""); setDate(undefined); setHours(""); setReason(""); setOvertimeType("regular");
    } catch (error: any) {
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border border-border bg-card shadow-xl">
        <DialogHeader><DialogTitle>Log Overtime</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} /></PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Hours</Label><Input className="rounded-xl" type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g., 2" /></div>
            <div>
              <Label>Type</Label>
              <Select value={overtimeType} onValueChange={setOvertimeType}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="weekend">Weekend</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {selectedEmployee && Number(hours) > 0 && (
            <div className="p-3 rounded-xl bg-muted/40 border border-border">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-muted-foreground">Rate</p><p className="font-semibold">{hourlyRate.toFixed(2)}/hr</p></div>
                <div><p className="text-muted-foreground">Multiplier</p><p className="font-semibold">{multiplier}x</p></div>
                <div><p className="text-muted-foreground">Total</p><p className="font-bold text-foreground">{totalAmount.toFixed(2)}</p></div>
              </div>
            </div>
          )}
          <div><Label>Reason (optional)</Label><Textarea className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for overtime..." /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl" onClick={handleSubmit} disabled={loading}>{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</> : "Submit"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
