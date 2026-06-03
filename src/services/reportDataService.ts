import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { calculateWorkingDaysInMonth, getEffectiveSalaryDivisor } from "@/utils/workingDays";

interface RawReportData {
  employees: Array<{
    id: string;
    name: string;
    rank: string;
    wage_rate: number;
    salary_divisor?: number | null;
    working_days_per_week?: number | null;
  }>;
  attendance: Array<{
    employee_id: string;
    status: string;
    date: string;
  }>;
  leave_requests?: Array<{
    employee_id: string;
    days_count: number;
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
  pendingLeaveDays: number;
  actualWorkingDays: number; // How many days they worked/earned
  expectedWorkingDays: number; // How many days they are expected to work in this month
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

  private static calculateEmployeeData(
    employee: any,
    attendance: any[],
    pendingLeaves: any[],
    month: Date
  ): ProcessedEmployeeData {
    const employeeAttendance = attendance.filter(att => att.employee_id === employee.id);
    const employeePendingLeaves = pendingLeaves.filter(req => req.employee_id === employee.id);
    
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
    
    let pendingLeaveDays = 0;
    employeePendingLeaves.forEach(req => {
      pendingLeaveDays += (req.days_count || 0);
    });
    
    const monthlySalary = Number(employee.wage_rate) || 0;
    
    // Per-employee divisor and expected working days
    const workingDaysPerWeek = employee.working_days_per_week || 6; // Default to 6-day week if not set
    const effectiveDivisor = getEffectiveSalaryDivisor(employee.salary_divisor, workingDaysPerWeek);
    const expectedWorkingDays = calculateWorkingDaysInMonth(month, workingDaysPerWeek);

    const dailyRate = monthlySalary / effectiveDivisor;
    const actualWorkingDays = presentDays + leaveDays + pendingLeaveDays + (shortLeaveDays * 0.5);
    const calculatedSalary = dailyRate * actualWorkingDays;
    
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      rank: employee.rank,
      monthlySalary,
      presentDays,
      shortLeaveDays,
      leaveDays,
      pendingLeaveDays,
      actualWorkingDays,
      expectedWorkingDays,
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
    // For global stats where a single "totalWorkingDaysThisMonth" is needed, we average the expected days.
    const totalExpectedDays = employeeData.reduce((sum, emp) => sum + emp.expectedWorkingDays, 0);
    const avgWorkingDaysThisMonth = totalEmployees > 0 ? Math.round(totalExpectedDays / totalEmployees) : 26;
    
    return {
      totalCalculatedSalary,
      totalBudgetSalary,
      totalEmployees,
      averageAttendance,
      averageDailyRate,
      totalWorkingDaysThisMonth: avgWorkingDaysThisMonth,
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
      // Single optimized query for employees
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("id, name, rank, wage_rate, salary_divisor, working_days_per_week")
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
            totalWorkingDaysThisMonth: 26,
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
      
      // Fetch pending leave requests
      const { data: pendingLeavesData, error: pendingLeavesError } = await supabase
        .from("leave_requests")
        .select("employee_id, days_count")
        .in("employee_id", employeeIds)
        .eq("status", "pending")
        .gte("end_date", monthStart)
        .lte("start_date", monthEnd);

      if (pendingLeavesError && pendingLeavesError.code !== "PGRST116") {
        console.error("Failed to fetch pending leaves:", pendingLeavesError);
      }
      
      // Process all data client-side with new per-employee daily rate calculation
      const employeeData = employees.map(employee => 
        this.calculateEmployeeData(employee, attendance || [], pendingLeavesData || [], month)
      );
      
      const stats = this.calculateStats(employeeData, 0); // 0 passed because we average dynamically now
      
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
