
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { formatCurrencySync } from "@/utils/salaryCalculations";
import { useCurrency } from "@/hooks/useCurrency";

interface EmployeeSalaryData {
  employeeId: string;
  employeeName: string;
  rank: string;
  monthlySalary: number;
  presentDays: number;
  shortLeaveDays: number;
  leaveDays: number;
  calculatedSalary: number;
  actualWorkingDays: number;
  dailyRate: number;
}

interface PayslipsGridProps {
  employeeSalaryData: EmployeeSalaryData[];
  totalWorkingDaysThisMonth: number;
  currentMonthName: string;
  loading: boolean;
  downloading: boolean;
  onDownloadAll: () => void;
  onDownloadIndividual: (data: EmployeeSalaryData) => void;
}

export default function PayslipsGrid({
  employeeSalaryData,
  totalWorkingDaysThisMonth,
  currentMonthName,
  loading,
  downloading,
  onDownloadAll,
  onDownloadIndividual
}: PayslipsGridProps) {
  useCurrency();

  return (
    <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 bg-muted/5 border-b border-border/50">
        <CardTitle className="text-base font-bold text-foreground">Individual Payslips - {currentMonthName}</CardTitle>
        <Button 
          onClick={onDownloadAll}
          disabled={downloading || loading}
          className="rounded-xl h-9 px-4 text-xs font-bold shadow-sm"
        >
          {downloading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-2 h-3.5 w-3.5" />
          )}
          Export All PDFs
        </Button>
      </CardHeader>
      <CardContent className="p-5 md:p-6 bg-muted/5">
        {loading ? (
          <div className="flex flex-col justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generating Payslips</p>
          </div>
        ) : employeeSalaryData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No active employees found. Add employees to generate payslips.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {employeeSalaryData.map((data) => (
              <Card key={data.employeeId} className="bg-card border-border/60 shadow-sm rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-300 group">
                <CardHeader className="p-4 pb-3 border-b border-border/30 bg-muted/10 flex flex-row items-start justify-between">
                  <div className="flex flex-col gap-0.5">
                    <CardTitle className="text-base font-bold">{data.employeeName}</CardTitle>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{data.rank}</p>
                  </div>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-8 w-8 rounded-lg border-border/60 bg-background hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors opacity-0 group-hover:opacity-100"
                    onClick={() => onDownloadIndividual(data)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex flex-col gap-1 p-2 rounded-lg bg-muted/30">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Monthly Salary</span>
                        <span className="font-semibold text-foreground">{formatCurrencySync(data.monthlySalary)}</span>
                      </div>
                      <div className="flex flex-col gap-1 p-2 rounded-lg bg-muted/30">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Daily Rate</span>
                        <span className="font-semibold text-foreground">{formatCurrencySync(data.dailyRate)}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-xs font-medium border border-border/40 rounded-lg p-3 bg-background">
                      <div className="flex justify-between items-center pb-2 border-b border-border/40">
                        <span className="text-muted-foreground">Attendance / Working Days</span>
                        <span className="font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{data.actualWorkingDays} / {totalWorkingDaysThisMonth}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Present Days</span>
                        <span>{data.presentDays}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Short Leave</span>
                        <span className="text-amber-500">{data.shortLeaveDays} <span className="text-[10px] text-muted-foreground opacity-60 ml-1">(0.5x)</span></span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center font-bold pt-3 px-1 border-t border-border/50">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">Net Payout</span>
                      <span className="text-lg text-primary">
                        {formatCurrencySync(data.calculatedSalary)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
