import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { toast } from "sonner";
import { UserPlus, Save, Briefcase, Calendar, CreditCard, User } from "lucide-react";
import type { EmployeeRow } from "@/types/supabase";
import { useQuery } from "@tanstack/react-query";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  cnic: z.string().optional().or(z.literal("")),
  emergency_contact: z.string().optional().or(z.literal("")),
  rank: z.string().min(1, "Rank is required"), 
  wage_rate: z.number().min(0, "Wage rate must be positive"),
  shift_type: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
  bank_name: z.string().optional().or(z.literal("")),
  bank_account_number: z.string().optional().or(z.literal("")),
  saturday_schedule: z.enum(["follow_company", "force_off", "force_on"]).default("follow_company"),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  employee?: EmployeeRow | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  employeeId?: string;
}

export default function EmployeeForm({ employee, onSuccess, onCancel, isOpen, onClose, employeeId }: EmployeeFormProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const { userProfile } = useAuth();
  const { logEmployeeActivity } = useActivityLogger();

  const { data: fetchedEmployee } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      if (!employeeId || !userProfile?.company_id) return null;
      const { data, error } = await supabase.from('employees').select('*').eq('id', employeeId).eq('company_id', userProfile.company_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId && !employee && !!userProfile?.company_id,
  });

  const currentEmployee = employee || fetchedEmployee;

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { 
      name: "", email: "", phone: "", cnic: "", emergency_contact: "",
      rank: "", wage_rate: 0, shift_type: "", status: "active",
      bank_name: "", bank_account_number: "", saturday_schedule: "follow_company" 
    },
  });

  useEffect(() => {
    if (currentEmployee) {
      let schedule: "follow_company" | "force_off" | "force_on" = "follow_company";
      if (currentEmployee.weekend_saturday === true) schedule = "force_off";
      if (currentEmployee.weekend_saturday === false) schedule = "force_on";

      form.reset({ 
        name: currentEmployee.name || "", 
        email: currentEmployee.email || "",
        phone: currentEmployee.phone || "",
        cnic: currentEmployee.cnic || "",
        emergency_contact: currentEmployee.emergency_contact || "",
        rank: currentEmployee.rank || "", 
        wage_rate: currentEmployee.wage_rate || 0, 
        shift_type: currentEmployee.shift_type || "",
        status: currentEmployee.status === "inactive" ? "inactive" : "active",
        bank_name: currentEmployee.bank_name || "",
        bank_account_number: currentEmployee.bank_account_number || "",
        saturday_schedule: schedule
      });
    } else {
      form.reset({ 
        name: "", email: "", phone: "", cnic: "", emergency_contact: "",
        rank: "", wage_rate: 0, shift_type: "", status: "active",
        bank_name: "", bank_account_number: "", saturday_schedule: "follow_company" 
      });
    }
  }, [currentEmployee, form]);

  const handleSubmit = async (data: EmployeeFormData) => {
    if (!userProfile?.company_id) { toast.error("Company setup required"); return; }
    setLoading(true);
    
    let weekend_saturday: boolean | null = null;
    if (data.saturday_schedule === "force_off") weekend_saturday = true;
    if (data.saturday_schedule === "force_on") weekend_saturday = false;

    const payload = {
      name: data.name, email: data.email, phone: data.phone, cnic: data.cnic, emergency_contact: data.emergency_contact,
      rank: data.rank, wage_rate: data.wage_rate, shift_type: data.shift_type, status: data.status,
      bank_name: data.bank_name, bank_account_number: data.bank_account_number,
      weekend_saturday, weekend_sunday: true // Sunday is always off
    };

    try {
      if (currentEmployee) {
        const { error } = await supabase.from("employees").update(payload).eq("id", currentEmployee.id);
        if (error) throw error;
        await logEmployeeActivity('update', data.name, { employee_id: currentEmployee.id, previous_rank: currentEmployee.rank, new_rank: data.rank });
        toast.success(`Employee ${data.name} updated successfully`);
      } else {
        const { data: newEmployee, error } = await supabase.from("employees").insert({ ...payload, company_id: userProfile.company_id }).select().single();
        if (error) throw error;
        await logEmployeeActivity('create', data.name, { employee_id: newEmployee.id, rank: data.rank });
        toast.success(`Employee ${data.name} added successfully`);
      }
      onSuccess?.();
      onClose?.();
    } catch (error: any) {
      console.error("Error saving employee:", error);
      toast.error("Failed to save employee");
    } finally { setLoading(false); }
  };

  const handleCancel = () => { form.reset(); onCancel?.(); onClose?.(); };

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="personal" className="text-xs sm:text-sm"><User className="h-4 w-4 mr-2 hidden sm:inline" /> Personal</TabsTrigger>
            <TabsTrigger value="employment" className="text-xs sm:text-sm"><Briefcase className="h-4 w-4 mr-2 hidden sm:inline" /> Work</TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-2 hidden sm:inline" /> Schedule</TabsTrigger>
            <TabsTrigger value="financial" className="text-xs sm:text-sm"><CreditCard className="h-4 w-4 mr-2 hidden sm:inline" /> Financial</TabsTrigger>
          </TabsList>

          <div className="h-[400px] overflow-y-auto px-1 pb-4">
            <TabsContent value="personal" className="space-y-4 mt-0">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Full Name *</FormLabel><FormControl><Input placeholder="John Doe" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="john@example.com" type="email" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="+1234567890" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="cnic" render={({ field }) => (
                  <FormItem><FormLabel>CNIC / National ID</FormLabel><FormControl><Input placeholder="00000-0000000-0" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="emergency_contact" render={({ field }) => (
                  <FormItem><FormLabel>Emergency Contact</FormLabel><FormControl><Input placeholder="Name & Phone" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </TabsContent>

            <TabsContent value="employment" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="rank" render={({ field }) => (
                  <FormItem><FormLabel>Rank / Position *</FormLabel><FormControl><Input placeholder="Software Engineer" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="shift_type" render={({ field }) => (
                  <FormItem><FormLabel>Shift Type</FormLabel><FormControl><Input placeholder="Morning / Night" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4 mt-0">
              <div className="rounded-2xl border border-border/50 bg-muted/10 p-5 space-y-4">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">Saturday Work Schedule</h4>
                  <p className="text-xs text-muted-foreground mt-1">Override the company default weekend rules for this specific employee.</p>
                </div>
                
                <FormField control={form.control} name="saturday_schedule" render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-2">
                        <FormItem className="flex items-center space-x-3 space-y-0 rounded-xl border border-border/40 p-4 bg-background/50 cursor-pointer">
                          <FormControl><RadioGroupItem value="follow_company" /></FormControl>
                          <div className="space-y-0.5"><FormLabel className="text-sm font-semibold cursor-pointer">Follow Company Default</FormLabel><p className="text-xs text-muted-foreground">Uses the global settings defined in Workspace Settings.</p></div>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0 rounded-xl border border-border/40 p-4 bg-background/50 cursor-pointer">
                          <FormControl><RadioGroupItem value="force_off" /></FormControl>
                          <div className="space-y-0.5"><FormLabel className="text-sm font-semibold cursor-pointer">Force Saturday OFF</FormLabel><p className="text-xs text-muted-foreground">Employee works a 5-day week regardless of company defaults.</p></div>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0 rounded-xl border border-border/40 p-4 bg-background/50 cursor-pointer">
                          <FormControl><RadioGroupItem value="force_on" /></FormControl>
                          <div className="space-y-0.5"><FormLabel className="text-sm font-semibold cursor-pointer">Force Saturday ON</FormLabel><p className="text-xs text-muted-foreground">Employee works a 6-day week regardless of company defaults.</p></div>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </TabsContent>

            <TabsContent value="financial" className="space-y-4 mt-0">
              <FormField control={form.control} name="wage_rate" render={({ field }) => (
                <FormItem><FormLabel>Monthly Wage Rate *</FormLabel><FormControl><Input type="number" step="0.01" placeholder="Enter wage rate" {...field} className="rounded-xl" onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="bank_name" render={({ field }) => (
                  <FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input placeholder="Bank XYZ" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="bank_account_number" render={({ field }) => (
                  <FormItem><FormLabel>Account Number</FormLabel><FormControl><Input placeholder="XXXX-XXXX-XXXX" {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex gap-3 pt-4 border-t border-border/50">
          <Button type="submit" disabled={loading} className="flex-1 rounded-xl h-12">
            {loading ? "Saving..." : currentEmployee ? "Save Changes" : "Create Employee"}
          </Button>
          <Button type="button" variant="outline" onClick={handleCancel} className="flex-1 rounded-xl h-12">
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );

  if (isOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
        <DialogContent className="max-w-2xl rounded-3xl border border-border bg-card shadow-2xl p-0 overflow-hidden gap-0">
          <DialogHeader className="p-6 pb-4 bg-muted/10 border-b border-border/50">
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary inline-flex items-center justify-center">
                {currentEmployee ? <Save className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              </div>
              {currentEmployee ? "Edit Employee Profile" : "Onboard New Employee"}
            </DialogTitle>
            <DialogDescription>
              {currentEmployee ? "Update the employee's details and configuration below." : "Fill in the details to add a new team member."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-4">
            {formContent}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/10 border-b border-border/50 pb-5">
        <CardTitle className="flex items-center gap-2">
          {currentEmployee ? <Save className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
          {currentEmployee ? "Edit Employee" : "Add New Employee"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">{formContent}</CardContent>
    </Card>
  );
}
