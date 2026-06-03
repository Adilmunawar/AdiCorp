
import { useState } from "react";
import Dashboard from "@/components/layout/Dashboard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSpreadsheet, Download, RefreshCw, History, Save } from "lucide-react";
import { useSalaryData } from "@/hooks/useSalaryData";
import { useSalaryDownloads } from "@/hooks/useSalaryDownloads";
import SalaryStats from "@/components/salary/SalaryStats";
import SalarySheet from "@/components/salary/SalarySheet";
import PayslipsGrid from "@/components/salary/PayslipsGrid";
import PayslipHistory from "@/components/salary/PayslipHistory";
import MonthSelector from "@/components/common/MonthSelector";
import { startOfMonth, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function SalaryPage() {
  const [activeTab, setActiveTab] = useState("salary-sheet");
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [generating, setGenerating] = useState(false);
  const { userProfile, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const { employeeSalaryData, loading, stats, error, totalWorkingDaysThisMonth, currentMonthName, handleRetry } = useSalaryData(selectedMonth);
  const { downloading, handleSalarySheetDownload, handlePayslipsDownload, handleIndividualPayslipDownload } = useSalaryDownloads(employeeSalaryData, totalWorkingDaysThisMonth, currentMonthName, userProfile?.companies || undefined);

  const handleGeneratePayslips = async () => {
    if (!userProfile?.company_id || employeeSalaryData.length === 0) return;
    setGenerating(true);
    try {
      const monthStr = format(selectedMonth, "yyyy-MM-dd");
      const payslips = employeeSalaryData.map((emp) => ({
        employee_id: emp.employeeId,
        company_id: userProfile.company_id!,
        month: monthStr,
        basic_salary: emp.monthlySalary,
        daily_rate: emp.dailyRate,
        days_worked: emp.actualWorkingDays,
        present_days: emp.presentDays,
        short_leave_days: emp.shortLeaveDays,
        gross_salary: emp.calculatedSalary,
        net_salary: emp.calculatedSalary,
        total_deductions: 0,
        generated_by: user?.id,
      }));

      const { error } = await supabase.from("payslips").insert(payslips);
      if (error) throw error;
      toast({ title: `${payslips.length} payslips generated and saved` });
    } catch (error: any) {
      toast({ title: "Failed to generate payslips", description: error.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (error && !loading) {
    return (
      <Dashboard title="Salary Management">
        <div className="max-w-xl mx-auto py-10">
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={handleRetry}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
          </div>
        </div>
      </Dashboard>
    );
  }

  if (!userProfile?.company_id && !loading) {
    return (
      <Dashboard title="Salary Management">
        <div className="max-w-xl mx-auto py-10">
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm space-y-4">
            <p className="text-muted-foreground">Please complete company setup before running payroll.</p>
            <Button variant="outline" onClick={() => navigate('/settings')}>Go to Settings</Button>
          </div>
        </div>
      </Dashboard>
    );
  }
  
  return (
    <Dashboard title="Salary Management">
      <div className="rounded-3xl border border-border bg-card p-5 md:p-6 mb-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Salary Management</h2>
            <p className="text-sm text-muted-foreground mt-1">Run attendance-based payroll, export sheets, and manage payslip history.</p>
          </div>
          <div className="flex flex-col md:items-end gap-3">
            <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground hidden sm:block">Viewing data for {currentMonthName}</div>
              <Button onClick={handleGeneratePayslips} disabled={generating || loading || employeeSalaryData.length === 0} variant="outline" className="gap-2">
                <Save className="h-4 w-4" />{generating ? "Generating..." : "Save Payslips"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SalaryStats stats={stats} loading={loading} />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="rounded-2xl border border-border bg-card shadow-sm p-2 overflow-x-auto hide-scrollbar">
          <TabsList className="bg-transparent flex sm:grid sm:grid-cols-3 gap-2 h-auto min-w-max sm:min-w-0 p-0">
            <TabsTrigger value="salary-sheet" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm text-muted-foreground hover:bg-muted/50 transition-all duration-200 rounded-xl text-xs font-bold uppercase tracking-wider"><FileSpreadsheet className="h-4 w-4" />Salary Sheet</TabsTrigger>
            <TabsTrigger value="payslips" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm text-muted-foreground hover:bg-muted/50 transition-all duration-200 rounded-xl text-xs font-bold uppercase tracking-wider"><Download className="h-4 w-4" />Payslips</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center justify-center gap-2 py-2.5 px-4 sm:px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm text-muted-foreground hover:bg-muted/50 transition-all duration-200 rounded-xl text-xs font-bold uppercase tracking-wider"><History className="h-4 w-4" />History</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="salary-sheet" className="animate-fade-in">
          <SalarySheet employeeSalaryData={employeeSalaryData} totalWorkingDaysThisMonth={totalWorkingDaysThisMonth} currentMonthName={currentMonthName} loading={loading} downloading={downloading} onDownload={handleSalarySheetDownload} />
        </TabsContent>
        
        <TabsContent value="payslips" className="animate-fade-in">
          <PayslipsGrid employeeSalaryData={employeeSalaryData} totalWorkingDaysThisMonth={totalWorkingDaysThisMonth} currentMonthName={currentMonthName} loading={loading} downloading={downloading} onDownloadAll={handlePayslipsDownload} onDownloadIndividual={handleIndividualPayslipDownload} />
        </TabsContent>

        <TabsContent value="history" className="animate-fade-in">
          <PayslipHistory />
        </TabsContent>
      </Tabs>
    </Dashboard>
  );
}
