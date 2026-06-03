import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { Download, Upload, FileSpreadsheet, Users } from "lucide-react";
import * as XLSX from 'xlsx';
import { EmployeeRow } from "@/types/supabase";

interface EmployeeImportExportProps { onImportComplete: () => void; employees: EmployeeRow[]; }
interface ImportEmployee { 
  name: string; 
  rank?: string; 
  wage_rate?: number; 
  status?: string;
  email?: string;
  phone?: string;
  cnic?: string;
  date_of_birth?: string;
  father_name?: string;
  education?: string;
  shift_type?: string;
  bank_name?: string;
  bank_account_number?: string;
  emergency_contact?: string;
}

export default function EmployeeImportExport({ onImportComplete, employees }: EmployeeImportExportProps) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userProfile } = useAuth();
  const { logActivity } = useActivityLogger();

  const downloadTemplate = () => {
    const templateData = [{ 
      name: "John Doe", 
      rank: "Manager", 
      wage_rate: 50000, 
      status: "active",
      email: "john@example.com",
      phone: "03001234567",
      cnic: "35501-0600360-9",
      date_of_birth: "1990-01-01",
      father_name: "Richard Doe",
      education: "Bachelors",
      shift_type: "Morning",
      bank_name: "Chase",
      bank_account_number: "PK12345678",
      emergency_contact: "03009876543"
    }];
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(templateData);
    // Auto-fit columns roughly
    ws['!cols'] = [
      { width: 20 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 25 },
      { width: 15 }, { width: 20 }, { width: 15 }, { width: 20 }, { width: 15 },
      { width: 15 }, { width: 20 }, { width: 25 }, { width: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Employee Template"); XLSX.writeFile(wb, "employee_import_template.xlsx");
    toast.success("Template downloaded", { description: "Use this template to import your employees" });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!userProfile?.company_id) { toast.error("Company setup required"); return; }
    setImporting(true);
    try {
      const data = await file.arrayBuffer(); const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as ImportEmployee[];
      if (!jsonData.length) throw new Error("No data found");
      
      const requiredFields = ['name'];
      const missingFields = requiredFields.filter(field => !jsonData.every(row => row[field as keyof ImportEmployee] !== undefined));
      if (missingFields.length > 0) throw new Error(`Missing strictly required fields: ${missingFields.join(', ')}`);
      
      const employeesToInsert = jsonData.map(emp => ({ 
        company_id: userProfile.company_id,
        name: emp.name?.toString().trim() || "Unknown", 
        rank: emp.rank?.toString().trim() || "Employee", 
        wage_rate: emp.wage_rate ? parseFloat(emp.wage_rate.toString()) : 0, 
        status: emp.status ? emp.status.toString().toLowerCase() : 'active',
        email: emp.email?.toString().trim() || null,
        phone: emp.phone?.toString().trim() || null,
        cnic: emp.cnic?.toString().trim() || null,
        date_of_birth: emp.date_of_birth?.toString().trim() || null,
        father_name: emp.father_name?.toString().trim() || null,
        education: emp.education?.toString().trim() || null,
        shift_type: emp.shift_type?.toString().trim() || null,
        bank_name: emp.bank_name?.toString().trim() || null,
        bank_account_number: emp.bank_account_number?.toString().trim() || null,
        emergency_contact: emp.emergency_contact?.toString().trim() || null
      }));
      
      const invalidWages = employeesToInsert.filter(emp => isNaN(emp.wage_rate));
      if (invalidWages.length > 0) throw new Error("Some wage rates are not valid numbers");
      
      const { data: insertedData, error } = await supabase.from('employees').insert(employeesToInsert).select();
      if (error) throw error;
      await logActivity({ actionType: 'employee_import', description: `Imported ${insertedData?.length || 0} employees from Excel file`, details: { file_name: file.name, employees_count: insertedData?.length || 0 }, priority: 'medium' });
      toast.success("Import successful", { description: `Successfully imported ${insertedData?.length || 0} employees` });
      onImportComplete();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) { console.error("Import error:", error); toast.error("Import failed", { description: error instanceof Error ? error.message : "Please check your file format" }); }
    finally { setImporting(false); }
  };

  const exportEmployees = async () => {
    if (!employees.length) { toast.error("No employees to export"); return; }
    setExporting(true);
    try {
      const exportData = employees.map(emp => ({ name: emp.name, rank: emp.rank, wage_rate: emp.wage_rate, status: emp.status, created_at: new Date(emp.created_at).toLocaleDateString() }));
      const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [{ width: 20 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, "Employees");
      const fileName = `employees_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      await logActivity({ actionType: 'employee_export', description: `Exported ${employees.length} employees to Excel file`, details: { file_name: fileName, employees_count: employees.length }, priority: 'low' });
      toast.success("Export successful", { description: `Exported ${employees.length} employees to ${fileName}` });
    } catch (error) { console.error("Export error:", error); toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary inline-flex items-center justify-center">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Bulk Import / Export</p>
            <p className="text-xs text-muted-foreground font-normal">Manage employee data with spreadsheet workflows</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />Import from Excel</h3>
            <Button variant="outline" onClick={downloadTemplate} className="w-fit rounded-xl"><Download className="mr-2 h-4 w-4" />Download Template</Button>
            <div className="space-y-2">
              <Label htmlFor="file-upload">Upload file</Label>
              <Input id="file-upload" type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={importing} className="cursor-pointer rounded-xl" />
            </div>
            {importing && <div className="text-sm text-muted-foreground">Importing employees... Please wait.</div>}
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Download className="h-4 w-4 text-primary" />Export to Excel</h3>
            <Button onClick={exportEmployees} disabled={exporting || employees.length === 0} className="rounded-xl">
              <Users className="mr-2 h-4 w-4" />{exporting ? "Exporting..." : `Export ${employees.length} Employees`}
            </Button>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
