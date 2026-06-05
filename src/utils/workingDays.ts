
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, format } from "date-fns";

/**
 * Calculates the exact number of working days in a specific month for a given employee
 * based on their working_days_per_week setting.
 * 
 * If workingDaysPerWeek is 5, weekends are Saturday & Sunday (days 0 & 6).
 * If workingDaysPerWeek is 6, weekend is Sunday only (day 0).
 */
export const calculateWorkingDaysInMonth = (date: Date, workingDaysPerWeek: number = 6, joiningDateStr?: string | null): number => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const daysInMonth = eachDayOfInterval({ start, end });
  
  let workingDaysCount = 0;
  
  const joinDate = joiningDateStr ? new Date(joiningDateStr + "T00:00:00") : null;

  daysInMonth.forEach(day => {
    // If the day is before the employee joined, it is not a working day for them
    if (joinDate && day < joinDate) return;

    const dayOfWeek = getDay(day); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    if (workingDaysPerWeek === 5) {
      // 5-day workweek: Monday (1) through Friday (5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        workingDaysCount++;
      }
    } else {
      // 6-day workweek (or default): Monday (1) through Saturday (6)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        workingDaysCount++;
      }
    }
  });
  
  return workingDaysCount;
};

/**
 * Helper to get the daily rate divisor. It returns the employee's explicit
 * salary_divisor if set, otherwise defaults to 26 (for 6 days) or 22 (for 5 days).
 */
export const getEffectiveSalaryDivisor = (
  explicitDivisor?: number | null, 
  workingDaysPerWeek: number = 6
): number => {
  if (explicitDivisor && explicitDivisor > 0) {
    return explicitDivisor;
  }
  return workingDaysPerWeek === 5 ? 22 : 26;
};

/**
 * Check if a specific date is a working day based on the employee's config.
 */
export const isWorkingDayForEmployee = (date: Date, workingDaysPerWeek: number = 6, joiningDateStr?: string | null): boolean => {
  if (joiningDateStr) {
    const joinDate = new Date(joiningDateStr + "T00:00:00");
    if (date < joinDate) return false;
  }
  const dayOfWeek = getDay(date);
  if (workingDaysPerWeek === 5) {
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }
  return dayOfWeek >= 1 && dayOfWeek <= 6;
};

