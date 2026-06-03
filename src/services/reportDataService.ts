
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface RawReportData {
  employees: Array<{
    id: string;
    name: string;
    rank: string;
    wage_rate: number;
    salary_divisor?: number | null;
  }>;
  attendance: Array<{
    employee_id: string;
    status: string;
    date: string;
  }>;
}

interface ProcessedEmployeeData {
  employeeId: string;
  employeeName: string;
  rank: string;
  monthlySalary: number;
  presentDays: number;
  shortLeaveDays: number;
  leaveDays: number;
  actualWorkingDays: number;
  dailyRate: number;
  calculatedSalary: number;
}

interface ReportStats {
  totalCalculatedSalary: number;
  totalBudgetSalary: number;
  totalEmployees: number;
  averageAttendance: number;
  averageDailyRate: number;
  totalWorkingDaysThisMonth: number;
}

// Cache to avoid repeated calculations
const dataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export class ReportDataService {
  private static async getWorkingDaysInMonth(companyId: string, month: Date): Promise<{ totalWorkingDays: number; dailyRateDivisor: number }> {
    try {
      // Use the new database function to get accurate working days
      const { data, error } = await supabase.rpc('get_working_days_for_month', {
        target_company_id: companyId,
        target_month: format(month, 'yyyy-MM-dd')
      });

      if (error) {
        console.error("Error getting working days:", error);
        // Fallback to default
        return { totalWorkingDays: 22, dailyRateDivisor: 26 };
      }

      if (data && data.length > 0) {
        return {
          totalWorkingDays: data[0].total_working_days,
          dailyRateDivisor: data[0].daily_rate_divisor
        };
      }

      // Default fallback
      return { totalWorkingDays: 22, dailyRateDivisor: 26 };
    } catch (error) {
      console.error("Error in getWorkingDaysInMonth:", error);
      return { totalWorkingDays: 22, dailyRateDivisor: 26 };
    }
  }

  private static calculateEmployeeData(
    employee: any,
    attendance: any[],
    globalDailyRateDivisor: number
  ): ProcessedEmployeeData {
    const employeeAttendance = attendance.filter(att => att.employee_id === employee.id);
    
    let presentDays = 0;
    let shortLeaveDays = 0;
    let leaveDays = 0;
    
    employeeAttendance.forEach(record => {
      switch (record.status) {
        case "present":
          presentDays++;
          break;
        case "short_leave":
          shortLeaveDays++;
          break;
        case "leave":
          leaveDays++;
          break;
      }
    });
    
    const monthlySalary = Number(employee.wage_rate) || 0;
    // Use employee's specific divisor if available, otherwise fallback to global
    const effectiveDivisor = employee.salary_divisor || globalDailyRateDivisor;
    const dailyRate = monthlySalary / effectiveDivisor;
    const actualWorkingDays = presentDays + (shortLeaveDays * 0.5);
    const calculatedSalary = dailyRate * actualWorkingDays;
    
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      rank: employee.rank,
      monthlySalary,
      presentDays,
      shortLeaveDays,
      leaveDays,
      actualWorkingDays,
      dailyRate,
      calculatedSalary,
    };
  }

  private static calculateStats(employeeData: ProcessedEmployeeData[], totalWorkingDays: number): ReportStats {
    const totalCalculatedSalary = employeeData.reduce((sum, emp) => sum + emp.calculatedSalary, 0);
    const totalBudgetSalary = employeeData.reduce((sum, emp) => sum + emp.monthlySalary, 0);
    const totalEmployees = employeeData.length;
    const averageAttendance = totalEmployees > 0 
      ? employeeData.reduce((sum, emp) => sum + emp.actualWorkingDays, 0) / totalEmployees 
      : 0;
    const averageDailyRate = totalEmployees > 0
      ? employeeData.reduce((sum, emp) => sum + emp.dailyRate, 0) / totalEmployees
      : 0;
    
    return {
      totalCalculatedSalary,
      totalBudgetSalary,
      totalEmployees,
      averageAttendance,
      averageDailyRate,
      totalWorkingDaysThisMonth: totalWorkingDays,
    };
  }

  static async fetchReportData(companyId: string, month: Date): Promise<{
    employeeData: ProcessedEmployeeData[];
    stats: ReportStats;
  }> {
    if (!companyId) {
      throw new Error("Company ID is required");
    }

    const cacheKey = `${companyId}-${format(month, 'yyyy-MM')}`;
    const cached = dataCache.get(cacheKey);
    
    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

    try {
      // Get working days configuration
      const { totalWorkingDays, dailyRateDivisor } = await this.getWorkingDaysInMonth(companyId, month);

      // Single optimized query for employees
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("id, name, rank, wage_rate, salary_divisor")
        .eq("company_id", companyId)
        .eq("status", "active");

      if (employeesError) {
        throw new Error(`Failed to fetch employees: ${employeesError.message}`);
      }

      if (!employees || employees.length === 0) {
        const emptyResult = {
          employeeData: [],
          stats: {
            totalCalculatedSalary: 0,
            totalBudgetSalary: 0,
            totalEmployees: 0,
            averageAttendance: 0,
            averageDailyRate: 0,
            totalWorkingDaysThisMonth: totalWorkingDays,
          },
        };
        dataCache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
        return emptyResult;
      }

      // Single optimized query for attendance
      const employeeIds = employees.map(emp => emp.id);
      const { data: attendance, error: attendanceError } = await supabase
        .from("attendance")
        .select("employee_id, status, date")
        .in("employee_id", employeeIds)
        .gte("date", monthStart)
        .lte("date", monthEnd);

      if (attendanceError && attendanceError.code !== "PGRST116") {
        throw new Error(`Failed to fetch attendance: ${attendanceError.message}`);
      }
      
      // Process all data client-side with new daily rate calculation
      const employeeData = employees.map(employee => 
        this.calculateEmployeeData(employee, attendance || [], dailyRateDivisor)
      );
      
      const stats = this.calculateStats(employeeData, totalWorkingDays);
      
      const result = { employeeData, stats };
      
      // Cache the result
      dataCache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      return result;
    } catch (error: any) {
      throw new Error(error.message || "Failed to fetch report data");
    }
  }

  static clearCache() {
    dataCache.clear();
  }
}
