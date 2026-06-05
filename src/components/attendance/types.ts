export type AttendanceStatusValue = "present" | "short_leave" | "absent" | "leave";

export interface AttendanceRecord {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: AttendanceStatusValue;
  isLocked?: boolean;
}

export const ATTENDANCE_STATUS_OPTIONS: Array<{ value: AttendanceStatusValue; label: string }> = [
  { value: "present", label: "Present (Full Day)" },
  { value: "short_leave", label: "Short Leave (Half Day)" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave (Approved)" },
];