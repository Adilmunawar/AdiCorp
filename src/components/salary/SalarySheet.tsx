
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2 } from "lucide-react";
import { formatCurrencySync } from "@/utils/salaryCalculations";
import { useCurrency } from "@/hooks/useCurrency";

interface EmployeeSalaryData {
  employeeId: string; employeeName: string; rank: string; monthlySalary: number;
  presentDays: number; shortLeaveDays: number; leaveDays: number;
  calculatedSalary: number; actualWorkingDays: number; dailyRate: number;
}

interface SalarySheetProps {
  employeeSalaryData: EmployeeSalaryData[]; totalWorkingDaysThisMonth: number;
  currentMonthName: string; loading: boolean; downloading: boolean; onDownload: () => void;
}

export default function SalarySheet({ employeeSalaryData, totalWorkingDaysThisMonth, currentMonthName, loading, downloading, onDownload }: SalarySheetProps) {
  useCurrency();
  return (
    <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 bg-muted/5 border-b border-border/50">
        <CardTitle className="text-base font-bold text-foreground">Attendance-Based Salary Sheet - {currentMonthName}</CardTitle>
        <Button onClick={onDownload} disabled={downloading || loading} className="rounded-xl h-9 px-4 text-xs font-bold shadow-sm">
          {downloading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="p-5 md:p-6">
        {loading ? (
          <div className="flex flex-col justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary mb-3" /><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generating Sheet</p></div>
        ) : employeeSalaryData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><p className="text-sm">No active employees found. Add employees to generate salary sheets.</p></div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/50 bg-background shadow-sm">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="font-semibold text-xs uppercase tracking-wider h-11">Employee</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider h-11">Position</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider h-11 text-right">Monthly Salary</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider h-11 text-right">Daily Rate</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider h-11 text-center">Working Days</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider h-11 text-right text-primary">Calculated Salary</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider h-11">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeSalaryData.map((data) => (
                  <TableRow key={data.employeeId} className="border-border/50 hover:bg-muted/10 transition-colors">
                    <TableCell className="font-bold text-sm">{data.employeeName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{data.rank}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrencySync(data.monthlySalary)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatCurrencySync(data.dailyRate)}</TableCell>
                    <TableCell className="text-center text-xs font-bold bg-muted/5">
                      {data.actualWorkingDays} <span className="text-muted-foreground font-medium">/ {totalWorkingDaysThisMonth}</span>
                    </TableCell>
                    <TableCell className="text-right font-black text-primary text-sm bg-primary/5">{formatCurrencySync(data.calculatedSalary)}</TableCell>
                    <TableCell>
                      <Badge variant={data.actualWorkingDays > 0 ? "default" : "destructive"} className="rounded-lg text-[10px] uppercase tracking-wider font-bold">
                        {data.actualWorkingDays > 0 ? "Earned" : "No Attendance"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
