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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { toast } from "sonner";
import { UserPlus, Save, Briefcase, Calendar, CreditCard, User, UploadCloud, GraduationCap } from "lucide-react";
import type { EmployeeRow } from "@/types/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  cnic: z.string().optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  father_name: z.string().optional().or(z.literal("")),
  education: z.string().optional().or(z.literal("")),
  emergency_contact: z.string().optional().or(z.literal("")),
  rank: z.string().min(1, "Rank is required"), 
  wage_rate: z.number().min(0, "Wage rate must be positive"),
  shift_type: z.enum(["Morning", "Evening", "Night"]).optional().or(z.literal("")),
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
  const { userProfile } = useAuth();
  const { logEmployeeActivity } = useActivityLogger();
  const queryClient = useQueryClient();

  const [cnicFile, setCnicFile] = useState<File | null>(null);
  const [degreeFile, setDegreeFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);

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
      name: "", email: "", phone: "", cnic: "", date_of_birth: "", father_name: "", education: "", emergency_contact: "",
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
        date_of_birth: currentEmployee.date_of_birth || "",
        father_name: currentEmployee.father_name || "",
        education: currentEmployee.education || "",
        emergency_contact: currentEmployee.emergency_contact || "",
        rank: currentEmployee.rank || "", 
        wage_rate: currentEmployee.wage_rate || 0, 
        shift_type: (currentEmployee.shift_type as any) || "",
        status: currentEmployee.status === "inactive" ? "inactive" : "active",
        bank_name: currentEmployee.bank_name || "",
        bank_account_number: currentEmployee.bank_account_number || "",
        saturday_schedule: schedule
      });
    } else {
      form.reset({ 
        name: "", email: "", phone: "", cnic: "", date_of_birth: "", father_name: "", education: "", emergency_contact: "",
        rank: "", wage_rate: 0, shift_type: "", status: "active",
        bank_name: "", bank_account_number: "", saturday_schedule: "follow_company" 
      });
      setCnicFile(null); setDegreeFile(null); setContractFile(null);
    }
  }, [currentEmployee, form]);

  const handleDocumentUpload = async (file: File, docType: string, docName: string, empId: string) => {
    try {
      const filePath = `${userProfile?.company_id}/${empId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("employee-documents").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("employee_documents").insert({
        employee_id: empId,
        company_id: userProfile?.company_id,
        document_name: docName,
        document_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      });
      if (dbError) throw dbError;
    } catch (err) {
      console.error("Error uploading document:", err);
      toast.error(`Failed to upload ${docName}`);
    }
  };

  const handleSubmit = async (data: EmployeeFormData) => {
    if (!userProfile?.company_id) { toast.error("Company setup required"); return; }
    setLoading(true);
    
    let weekend_saturday: boolean | null = null;
    if (data.saturday_schedule === "force_off") weekend_saturday = true;
    if (data.saturday_schedule === "force_on") weekend_saturday = false;

    const payload = {
      name: data.name, email: data.email, phone: data.phone, cnic: data.cnic, 
      date_of_birth: data.date_of_birth || null, father_name: data.father_name, education: data.education, emergency_contact: data.emergency_contact,
      rank: data.rank, wage_rate: data.wage_rate, shift_type: data.shift_type, status: data.status,
      bank_name: data.bank_name, bank_account_number: data.bank_account_number,
      weekend_saturday, weekend_sunday: true 
    };

    try {
      let finalEmployeeId = currentEmployee?.id;

      if (currentEmployee) {
        const { error } = await supabase.from("employees").update(payload).eq("id", currentEmployee.id);
        if (error) throw error;
        await logEmployeeActivity('update', data.name, { employee_id: currentEmployee.id, previous_rank: currentEmployee.rank, new_rank: data.rank });
      } else {
        const { data: newEmployee, error } = await supabase.from("employees").insert({ ...payload, company_id: userProfile.company_id }).select().single();
        if (error) throw error;
        finalEmployeeId = newEmployee.id;
        await logEmployeeActivity('create', data.name, { employee_id: newEmployee.id, rank: data.rank });
      }

      // Handle document uploads
      if (finalEmployeeId) {
        if (cnicFile) await handleDocumentUpload(cnicFile, 'id_copy', 'National ID (CNIC)', finalEmployeeId);
        if (degreeFile) await handleDocumentUpload(degreeFile, 'certificate', 'Education Degree', finalEmployeeId);
        if (contractFile) await handleDocumentUpload(contractFile, 'contract', 'Employee Contract', finalEmployeeId);
      }

      toast.success(currentEmployee ? `Employee ${data.name} updated successfully` : `Employee ${data.name} added successfully`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
      onSuccess?.();
      onClose?.();
    } catch (error: any) {
      console.error("Error saving employee:", error);
      toast.error("Failed to save employee");
    } finally { setLoading(false); }
  };

  const handleCancel = () => { form.reset(); setCnicFile(null); setDegreeFile(null); setContractFile(null); onCancel?.(); onClose?.(); };

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        
        {/* Massive Single Page Grid Container */}
        <div className="h-[60vh] overflow-y-auto px-4 sm:px-6 pb-6 space-y-6 custom-scrollbar">
          
          {/* Section: Personal Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary font-semibold border-b border-border/50 pb-1 text-sm">
              <User className="h-3.5 w-3.5" /> Personal Details
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Full Name *</FormLabel><FormControl><Input placeholder="John Doe" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="father_name" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Father's Name</FormLabel><FormControl><Input placeholder="Father's Name" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Date of Birth</FormLabel><FormControl><Input type="date" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="cnic" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">CNIC / National ID</FormLabel><FormControl><Input placeholder="00000-0000000-0" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="education" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Education</FormLabel><FormControl><Input placeholder="BS Computer Science" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Email Address</FormLabel><FormControl><Input placeholder="john@example.com" type="email" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Phone Number</FormLabel><FormControl><Input placeholder="+1234567890" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="emergency_contact" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Emergency Contact</FormLabel><FormControl><Input placeholder="Name & Phone" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </div>

          {/* Section: Employment & Schedule */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary font-semibold border-b border-border/50 pb-1 text-sm">
              <Briefcase className="h-3.5 w-3.5" /> Employment & Schedule
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <FormField control={form.control} name="rank" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Position / Rank *</FormLabel><FormControl><Input placeholder="Software Engineer" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="shift_type" render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[10px]">Shift Timing</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="rounded-lg bg-muted/20 h-8 text-[11px]"><SelectValue placeholder="Select shift" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Morning" className="text-[11px]">Morning</SelectItem>
                      <SelectItem value="Evening" className="text-[11px]">Evening</SelectItem>
                      <SelectItem value="Night" className="text-[11px]">Night</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[10px]">Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="rounded-lg bg-muted/20 h-8 text-[11px]"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="active" className="text-[11px]">Active</SelectItem><SelectItem value="inactive" className="text-[11px]">Inactive</SelectItem></SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="bg-muted/10 rounded-xl p-3 border border-border/40 mt-2">
              <FormField control={form.control} name="saturday_schedule" render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-[11px] font-semibold">Weekend Configuration (Saturday)</FormLabel>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <FormItem className="flex items-center space-x-2 space-y-0 rounded-lg border border-border/40 p-2 bg-background/50 cursor-pointer">
                        <FormControl><RadioGroupItem value="follow_company" className="h-3 w-3" /></FormControl>
                        <div className="space-y-0"><FormLabel className="text-[10px] font-semibold cursor-pointer">Follow Default</FormLabel><p className="text-[9px] text-muted-foreground leading-tight">Uses global settings.</p></div>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0 rounded-lg border border-border/40 p-2 bg-background/50 cursor-pointer">
                        <FormControl><RadioGroupItem value="force_off" className="h-3 w-3" /></FormControl>
                        <div className="space-y-0"><FormLabel className="text-[10px] font-semibold cursor-pointer">5-Day Week</FormLabel><p className="text-[9px] text-muted-foreground leading-tight">Saturday is OFF.</p></div>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0 rounded-lg border border-border/40 p-2 bg-background/50 cursor-pointer">
                        <FormControl><RadioGroupItem value="force_on" className="h-3 w-3" /></FormControl>
                        <div className="space-y-0"><FormLabel className="text-[10px] font-semibold cursor-pointer">6-Day Week</FormLabel><p className="text-[9px] text-muted-foreground leading-tight">Saturday is ON.</p></div>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          {/* Section: Finance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary font-semibold border-b border-border/50 pb-1 text-sm">
              <CreditCard className="h-3.5 w-3.5" /> Financial Details
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormField control={form.control} name="wage_rate" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Monthly Salary *</FormLabel><FormControl><Input type="number" step="0.01" placeholder="Enter salary" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="bank_name" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Bank Name</FormLabel><FormControl><Input placeholder="e.g. Chase Bank" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="bank_account_number" render={({ field }) => (
                <FormItem className="space-y-1"><FormLabel className="text-[10px]">Account Number (IBAN)</FormLabel><FormControl><Input placeholder="XXXX-XXXX-XXXX" {...field} className="rounded-lg bg-muted/20 h-8 text-[11px]" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </div>

          {/* Section: Inline Documents Upload */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-primary font-semibold border-b border-border/50 pb-1 text-sm">
              <UploadCloud className="h-3.5 w-3.5" /> Employee Documents
            </div>
            <p className="text-[10px] text-muted-foreground">Attach necessary documents. They will be saved to the employee's permanent record.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              
              <div className="border border-border/50 bg-background/50 p-2.5 rounded-xl flex flex-col items-start gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold"><User className="h-3.5 w-3.5 text-primary" /> CNIC / ID Card</div>
                <Input type="file" className="text-[10px] h-7 file:text-[10px] file:bg-primary/10 file:text-primary file:border-0 file:rounded file:px-2 file:py-0.5 rounded-md p-1" onChange={(e) => setCnicFile(e.target.files?.[0] || null)} />
              </div>

              <div className="border border-border/50 bg-background/50 p-2.5 rounded-xl flex flex-col items-start gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold"><GraduationCap className="h-3.5 w-3.5 text-primary" /> Education Degree</div>
                <Input type="file" className="text-[10px] h-7 file:text-[10px] file:bg-primary/10 file:text-primary file:border-0 file:rounded file:px-2 file:py-0.5 rounded-md p-1" onChange={(e) => setDegreeFile(e.target.files?.[0] || null)} />
              </div>

              <div className="border border-border/50 bg-background/50 p-2.5 rounded-xl flex flex-col items-start gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold"><Briefcase className="h-3.5 w-3.5 text-primary" /> Employee Contract</div>
                <Input type="file" className="text-[10px] h-7 file:text-[10px] file:bg-primary/10 file:text-primary file:border-0 file:rounded file:px-2 file:py-0.5 rounded-md p-1" onChange={(e) => setContractFile(e.target.files?.[0] || null)} />
              </div>

            </div>
          </div>

        </div>

        <div className="flex gap-2 pt-4 px-4 border-t border-border/50 bg-muted/10 pb-4 rounded-b-xl">
          <Button type="button" variant="outline" onClick={handleCancel} className="flex-1 rounded-lg h-9 text-xs shadow-sm font-semibold">
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="flex-[2] rounded-lg h-9 text-xs shadow-md shadow-primary/20 font-bold">
            {loading ? "Processing..." : currentEmployee ? "Update Record" : "Create Record"}
          </Button>
        </div>
      </form>
    </Form>
  );

  if (isOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
        <DialogContent className="max-w-3xl rounded-2xl border border-border bg-card shadow-2xl p-0 overflow-hidden gap-0 w-[95vw]">
          <DialogHeader className="p-4 pb-3 bg-muted/10 border-b border-border/50">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
                {currentEmployee ? <Save className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              </div>
              {currentEmployee ? "Edit Employee Profile" : "Onboard New Employee"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {currentEmployee ? "Update the employee's details and configuration below." : "Fill out the form below to create a comprehensive employee record."}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
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
      <CardContent className="p-0 pt-4">{formContent}</CardContent>
    </Card>
  );
}
