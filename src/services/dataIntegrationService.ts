import { supabase } from "@/integrations/supabase/client";
import { calculateWorkingDaysInMonth, getEffectiveSalaryDivisor, isWorkingDayForEmployee } from "@/utils/workingDays";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";

export interface EmployeeData {
  id: string;
  name: string;
  rank: string;
  wage_rate: number;
  status: string;
  company_id: string;
  created_at: string;
  user_id: string | null;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'short_leave';
  created_at: string;
}

export interface SalaryCalculation {
  employee_id: string;
  basic_salary: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  overtime_hours: number;
  overtime_rate: number;
  gross_salary: number;
  deductions: number;
  net_salary: number;
}

class DataIntegrationService {
  private static instance: DataIntegrationService;
  private cache = new Map<string, any>();
  private cacheExpiry = new Map<string, number>();

  static getInstance(): DataIntegrationService {
    if (!DataIntegrationService.instance) {
      DataIntegrationService.instance = new DataIntegrationService();
    }
    return DataIntegrationService.instance;
  }

  private getCacheKey(prefix: string, params: any): string {
    return `${prefix}_${JSON.stringify(params)}`;
  }

  private isExpired(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return !expiry || Date.now() > expiry;
  }

  private setCache(key: string, data: any, ttlMinutes = 5): void {
    this.cache.set(key, data);
    this.cacheExpiry.set(key, Date.now() + ttlMinutes * 60 * 1000);
  }

  private getCache(key: string): any {
    if (this.isExpired(key)) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.cache.get(key);
  }

  async getEmployees(companyId: string): Promise<EmployeeData[]> {
    const cacheKey = this.getCacheKey('employees', { companyId });
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (error) throw error;

      const employees = data || [];
      this.setCache(cacheKey, employees);
      return employees;
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    }
  }

  async getAttendanceForMonth(companyId: string, month: Date): Promise<AttendanceRecord[]> {
    const cacheKey = this.getCacheKey('attendance', { 
      companyId, 
      month: format(month, 'yyyy-MM')
    });
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const startDate = format(startOfMonth(month), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(month), 'yyyy-MM-dd');

      // First get all employees for this company
      const employees = await this.getEmployees(companyId);
      const employeeIds = employees.map(emp => emp.id);

      if (employeeIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .in('employee_id', employeeIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

      if (error) throw error;

      // Cast the data to match our AttendanceRecord interface
      const attendance: AttendanceRecord[] = (data || []).map(record => ({
        id: record.id,
        employee_id: record.employee_id,
        date: record.date,
        status: record.status as 'present' | 'absent' | 'late' | 'short_leave',
        created_at: record.created_at
      }));

      this.setCache(cacheKey, attendance);
      return attendance;
    } catch (error) {
      console.error('Error fetching attendance:', error);
      return [];
    }
  }

  async calculateSalariesForMonth(companyId: string, month: Date): Promise<SalaryCalculation[]> {
    const cacheKey = this.getCacheKey('salaries', { 
      companyId, 
      month: format(month, 'yyyy-MM')
    });
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

      const [employees, attendance, overtime, leaveRequests, events] = await Promise.all([
        this.getEmployees(companyId),
        this.getAttendanceForMonth(companyId, month),
        supabase
          .from("overtime_records")
          .select("employee_id, hours, total_amount, status")
          .eq("company_id", companyId)
          .eq("status", "approved")
          .gte("date", monthStart)
          .lte("date", monthEnd)
          .then(res => res.data || []),
        supabase
          .from("leave_requests")
          .select("employee_id, start_date, end_date")
          .eq("company_id", companyId)
          .eq("status", "approved")
          .lte("start_date", monthEnd)
          .gte("end_date", monthStart)
          .then(res => res.data || []),
        supabase
          .from("events")
          .select("date, type, affects_attendance")
          .eq("company_id", companyId)
          .eq("affects_attendance", true)
          .gte("date", monthStart)
          .lte("date", monthEnd)
          .then(res => res.data || [])
      ]);

      const calculations: SalaryCalculation[] = employees.map(employee => {
        const employeeAttendance = attendance.filter(a => a.employee_id === employee.id);
        const employeeLeaves = leaveRequests.filter(l => l.employee_id === employee.id);
        
        // @ts-ignore - working_days_per_week exists but maybe not typed in EmployeeData interface yet
        const workingDaysPerWeek = employee.working_days_per_week || 6; 
        
        let presentDays = 0;
        let shortLeaveDays = 0;
        let paidLeaveDays = 0;
        let absentDays = 0;
        let workingDays = 0;

        const daysInMonth = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });

        daysInMonth.forEach(day => {
          // @ts-ignore
          if (isWorkingDayForEmployee(day, workingDaysPerWeek, employee.joining_date)) {
             workingDays++;
             const dateStr = format(day, 'yyyy-MM-dd');
             const isEventHoliday = events.some(e => e.date === dateStr);
             if (isEventHoliday) {
                 paidLeaveDays++;
                 return; // `return` acts as `continue` inside forEach
             }
             
             const record = employeeAttendance.find(a => a.date === dateStr);
             
             if (record?.status === 'present') {
                 presentDays++;
             } else if (record?.status === 'short_leave') {
                 shortLeaveDays++;
             } else {
                 const isLeaveApproved = employeeLeaves.some(l => dateStr >= l.start_date && dateStr <= l.end_date);
                 
                 if (isLeaveApproved) {
                     paidLeaveDays++;
                 } else {
                     absentDays++;
                 }
             }
          }
        });

        const actualWorkingDays = presentDays + (shortLeaveDays * 0.5) + paidLeaveDays;
        
        // @ts-ignore
        const effectiveDivisor = getEffectiveSalaryDivisor(employee.salary_divisor, workingDaysPerWeek);

        const dailyRate = employee.wage_rate / effectiveDivisor;
        const basicSalary = dailyRate * actualWorkingDays;
        
        // Use actual overtime records
        const employeeOvertime = overtime.filter(o => o.employee_id === employee.id);
        const totalOvertimeHours = employeeOvertime.reduce((sum, o) => sum + (Number(o.hours) || 0), 0);
        const overtimePay = employeeOvertime.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        const overtimeRate = totalOvertimeHours > 0 ? (overtimePay / totalOvertimeHours) : (dailyRate / 8 * 1.5);
        
        const grossSalary = basicSalary + overtimePay;
        
        // Basic deductions (can be enhanced)
        const taxDeduction = grossSalary * 0.05; // 5% tax
        const deductions = taxDeduction;
        const netSalary = grossSalary - deductions;

        return {
          employee_id: employee.id,
          basic_salary: basicSalary,
          working_days: workingDays,
          present_days: presentDays,
          absent_days: absentDays,
          overtime_hours: totalOvertimeHours,
          overtime_rate: overtimeRate,
          gross_salary: grossSalary,
          deductions,
          net_salary: netSalary
        };
      });

      this.setCache(cacheKey, calculations);
      return calculations;
    } catch (error) {
      console.error('Error calculating salaries:', error);
      return [];
    }
  }

  async getCompanyStats(companyId: string, month: Date) {
    const cacheKey = this.getCacheKey('company_stats', { 
      companyId, 
      month: format(month, 'yyyy-MM')
    });
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const [employees, attendance, salaries] = await Promise.all([
        this.getEmployees(companyId),
        this.getAttendanceForMonth(companyId, month),
        this.calculateSalariesForMonth(companyId, month)
      ]);

      const totalEmployees = employees.length;
      
      // Calculate dynamic average working days
      const totalWorkingDays = employees.reduce((sum, emp) => {
        // @ts-ignore
        const wd = emp.working_days_per_week || 6;
        // @ts-ignore
        return sum + calculateWorkingDaysInMonth(month, wd, emp.joining_date);
      }, 0);
      const avgWorkingDays = totalEmployees > 0 ? Math.round(totalWorkingDays / totalEmployees) : 26;

      const presentRecords = attendance.filter(a => a.status === 'present').length;
      const totalPossibleAttendance = totalWorkingDays;
      const averageAttendance = totalPossibleAttendance > 0 ? (presentRecords / totalPossibleAttendance) * 100 : 0;
      const totalSalaryExpense = salaries.reduce((sum, s) => sum + s.net_salary, 0);
      const totalOvertimeHours = salaries.reduce((sum, s) => sum + s.overtime_hours, 0);

      const stats = {
        totalEmployees,
        averageAttendance: Math.round(averageAttendance * 100) / 100,
        totalSalaryExpense: Math.round(totalSalaryExpense * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        workingDays: avgWorkingDays,
        presentEmployees: new Set(attendance.filter(a => a.status === 'present').map(a => a.employee_id)).size,
        absentEmployees: totalEmployees - new Set(attendance.filter(a => a.status === 'present').map(a => a.employee_id)).size
      };

      this.setCache(cacheKey, stats);
      return stats;
    } catch (error) {
      console.error('Error getting company stats:', error);
      return {
        totalEmployees: 0,
        averageAttendance: 0,
        totalSalaryExpense: 0,
        totalOvertimeHours: 0,
        workingDays: 0,
        presentEmployees: 0,
        absentEmployees: 0
      };
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  clearCacheForCompany(companyId: string): void {
    for (const [key] of this.cache) {
      if (key.includes(companyId)) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }
}

export const dataIntegrationService = DataIntegrationService.getInstance();
