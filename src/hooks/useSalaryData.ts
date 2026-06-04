
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth } from "date-fns";
import { ReportDataService } from "@/services/reportDataService";

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
  overtimePay: number;
  overtimeHours: number;
}

interface SalaryStats {
  totalBudgetSalary: number;
  totalCalculatedSalary: number;
  averageDailyRate: number;
  employeeCount: number;
}

export function useSalaryData(selectedMonth?: Date) {
  const [employeeSalaryData, setEmployeeSalaryData] = useState<EmployeeSalaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SalaryStats>({
    totalBudgetSalary: 0,
    totalCalculatedSalary: 0,
    averageDailyRate: 0,
    employeeCount: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [totalWorkingDaysThisMonth, setTotalWorkingDaysThisMonth] = useState(0);
  const { toast } = useToast();
  const { userProfile } = useAuth();
  
  const currentMonth = useMemo(() => selectedMonth || startOfMonth(new Date()), [selectedMonth]);
  const currentMonthName = useMemo(() => format(currentMonth, "MMMM yyyy"), [currentMonth]);

  const fetchAllData = useCallback(async () => {
    if (!userProfile?.company_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const { employeeData, stats: reportStats } = await ReportDataService.fetchReportData(
        userProfile.company_id,
        currentMonth
      );

      const transformedData = employeeData.map(emp => ({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        rank: emp.rank,
        monthlySalary: emp.monthlySalary,
        presentDays: emp.presentDays,
        shortLeaveDays: emp.shortLeaveDays,
        leaveDays: emp.leaveDays,
        calculatedSalary: emp.calculatedSalary,
        actualWorkingDays: emp.actualWorkingDays,
        dailyRate: emp.dailyRate,
        overtimePay: emp.overtimePay,
        overtimeHours: emp.overtimeHours,
      }));

      setEmployeeSalaryData(transformedData);
      setTotalWorkingDaysThisMonth(reportStats.totalWorkingDaysThisMonth);
      setStats({
        totalCalculatedSalary: reportStats.totalCalculatedSalary,
        totalBudgetSalary: reportStats.totalBudgetSalary,
        averageDailyRate: reportStats.averageDailyRate,
        employeeCount: reportStats.totalEmployees
      });
      
    } catch (error: any) {
      console.error("Salary - Error fetching data:", error);
      setError(error.message || "Failed to load salary data");
      toast({
        title: "Failed to load salary data",
        description: error.message || "Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userProfile?.company_id, currentMonth, toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleRetry = useCallback(() => {
    ReportDataService.clearCache();
    fetchAllData();
  }, [fetchAllData]);

  return {
    employeeSalaryData,
    loading,
    stats,
    error,
    totalWorkingDaysThisMonth,
    currentMonthName,
    fetchAllData,
    handleRetry,
    selectedMonth: currentMonth
  };
}
