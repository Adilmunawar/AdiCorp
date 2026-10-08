
import type { Database } from '@/integrations/supabase/types';

// Re-export types from Supabase
export type { Database } from '@/integrations/supabase/types';

// Define custom type aliases for easier use
export type CompanyRow = Database['public']['Tables']['companies']['Row'];
export type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
export type CompanyUpdate = Database['public']['Tables']['companies']['Update'];

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type EmployeeRow = Database['public']['Tables']['employees']['Row'];
export type EmployeeInsert = Database['public']['Tables']['employees']['Insert'];
export type EmployeeUpdate = Database['public']['Tables']['employees']['Update'];

export type AttendanceRow = Database['public']['Tables']['attendance']['Row'];
export type AttendanceInsert = Database['public']['Tables']['attendance']['Insert'];
export type AttendanceUpdate = Database['public']['Tables']['attendance']['Update'];

export type ActivityLogRow = Database['public']['Tables']['activity_logs']['Row'];
export type ActivityLogInsert = Database['public']['Tables']['activity_logs']['Insert'];
export type ActivityLogUpdate = Database['public']['Tables']['activity_logs']['Update'];

// Define custom types (kept in step with the CHECK constraints on attendance.status and employees.status)
export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'leave'
  | 'short_leave'
  | 'half_day'
  | 'late'
  | 'holiday'
  | 'weekend';
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave' | 'separated' | 'terminated';

export type NotificationRow = Database['public']['Tables']['notifications']['Row'];
export type DepartmentRow = Database['public']['Tables']['departments']['Row'];
export type SalaryHistoryRow = Database['public']['Tables']['salary_history']['Row'];
