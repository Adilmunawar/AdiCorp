export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          company_id: string
          created_at: string
          description: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action_type: string
          company_id: string
          created_at?: string
          description: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          description?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          id?: string
          status: string
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          company_size: string | null
          company_type: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          id: string
          logo: string | null
          name: string
          phone: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          company_size?: string | null
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          logo?: string | null
          name: string
          phone?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          company_size?: string | null
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          logo?: string | null
          name?: string
          phone?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_working_settings: {
        Row: {
          company_id: string
          created_at: string
          default_working_days_per_month: number
          default_working_days_per_week: number
          salary_divisor: number
          updated_at: string
          weekend_saturday: boolean
          weekend_sunday: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          default_working_days_per_month?: number
          default_working_days_per_week?: number
          salary_divisor?: number
          updated_at?: string
          weekend_saturday?: boolean
          weekend_sunday?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          default_working_days_per_month?: number
          default_working_days_per_week?: number
          salary_divisor?: number
          updated_at?: string
          weekend_saturday?: boolean
          weekend_sunday?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_working_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          company_id: string
          created_at: string
          document_name: string
          document_type: Database["public"]["Enums"]["document_type"]
          employee_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          document_name: string
          document_type?: Database["public"]["Enums"]["document_type"]
          employee_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          document_name?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          employee_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_update_requests: {
        Row: {
          company_id: string | null
          created_at: string | null
          employee_id: string | null
          id: string
          requested_changes: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          requested_changes: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          requested_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_update_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_update_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar_url: string | null
          bank_account_number: string | null
          bank_name: string | null
          cnic: string | null
          company_id: string
          created_at: string
          date_of_birth: string | null
          education: string | null
          email: string | null
          emergency_contact: string | null
          father_name: string | null
          id: string
          joining_date: string | null
          name: string
          password: string | null
          phone: string | null
          rank: string
          salary_divisor: number | null
          shift_type: string | null
          status: string
          tier: Database["public"]["Enums"]["employee_tier"] | null
          user_id: string | null
          wage_rate: number
          weekend_saturday: boolean | null
          weekend_sunday: boolean | null
          working_days_per_week: number | null
          working_hours_per_day: number | null
        }
        Insert: {
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cnic?: string | null
          company_id: string
          created_at?: string
          date_of_birth?: string | null
          education?: string | null
          email?: string | null
          emergency_contact?: string | null
          father_name?: string | null
          id?: string
          joining_date?: string | null
          name: string
          password?: string | null
          phone?: string | null
          rank: string
          salary_divisor?: number | null
          shift_type?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["employee_tier"] | null
          user_id?: string | null
          wage_rate: number
          weekend_saturday?: boolean | null
          weekend_sunday?: boolean | null
          working_days_per_week?: number | null
          working_hours_per_day?: number | null
        }
        Update: {
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cnic?: string | null
          company_id?: string
          created_at?: string
          date_of_birth?: string | null
          education?: string | null
          email?: string | null
          emergency_contact?: string | null
          father_name?: string | null
          id?: string
          joining_date?: string | null
          name?: string
          password?: string | null
          phone?: string | null
          rank?: string
          salary_divisor?: number | null
          shift_type?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["employee_tier"] | null
          user_id?: string | null
          wage_rate?: number
          weekend_saturday?: boolean | null
          weekend_sunday?: boolean | null
          working_days_per_week?: number | null
          working_hours_per_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          affects_attendance: boolean
          company_id: string
          created_at: string
          date: string
          description: string | null
          id: string
          title: string
          type: string
        }
        Insert: {
          affects_attendance?: boolean
          company_id: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          title: string
          type: string
        }
        Update: {
          affects_attendance?: boolean
          company_id?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      health_check: {
        Row: {
          created_at: string | null
          id: number
        }
        Insert: {
          created_at?: string | null
          id: number
        }
        Update: {
          created_at?: string | null
          id?: number
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          leave_type_id: string
          total_days: number
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          leave_type_id: string
          total_days?: number
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          leave_type_id?: string
          total_days?: number
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          company_id: string
          created_at: string
          days_count: number
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          days_count: number
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          days_count?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          company_id: string
          created_at: string
          days_per_year: number
          id: string
          is_active: boolean
          is_paid: boolean
          name: string
          type: Database["public"]["Enums"]["leave_type_enum"]
        }
        Insert: {
          company_id: string
          created_at?: string
          days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name: string
          type?: Database["public"]["Enums"]["leave_type_enum"]
        }
        Update: {
          company_id?: string
          created_at?: string
          days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name?: string
          type?: Database["public"]["Enums"]["leave_type_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_working_days: {
        Row: {
          company_id: string
          configuration: Json
          created_at: string
          daily_rate_divisor: number
          id: string
          month: string
          updated_at: string
          working_days_count: number
        }
        Insert: {
          company_id: string
          configuration?: Json
          created_at?: string
          daily_rate_divisor?: number
          id?: string
          month: string
          updated_at?: string
          working_days_count?: number
        }
        Update: {
          company_id?: string
          configuration?: Json
          created_at?: string
          daily_rate_divisor?: number
          id?: string
          month?: string
          updated_at?: string
          working_days_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_working_days_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_config: {
        Row: {
          company_id: string
          created_at: string
          holiday_multiplier: number
          max_daily_hours: number
          max_monthly_hours: number
          regular_multiplier: number
          requires_approval: boolean
          updated_at: string
          weekend_multiplier: number
        }
        Insert: {
          company_id: string
          created_at?: string
          holiday_multiplier?: number
          max_daily_hours?: number
          max_monthly_hours?: number
          regular_multiplier?: number
          requires_approval?: boolean
          updated_at?: string
          weekend_multiplier?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          holiday_multiplier?: number
          max_daily_hours?: number
          max_monthly_hours?: number
          regular_multiplier?: number
          requires_approval?: boolean
          updated_at?: string
          weekend_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "overtime_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_records: {
        Row: {
          company_id: string
          created_at: string
          date: string
          employee_id: string
          hourly_rate: number
          hours: number
          id: string
          multiplier: number
          overtime_type: string
          reason: string | null
          requested_by: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          employee_id: string
          hourly_rate: number
          hours: number
          id?: string
          multiplier: number
          overtime_type?: string
          reason?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          hourly_rate?: number
          hours?: number
          id?: string
          multiplier?: number
          overtime_type?: string
          reason?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          basic_salary: number
          company_id: string
          created_at: string
          daily_rate: number
          days_worked: number
          deductions: Json | null
          employee_id: string
          generated_by: string | null
          gross_salary: number
          id: string
          month: string
          net_salary: number
          notes: string | null
          overtime_earnings: number | null
          overtime_hours: number | null
          present_days: number
          short_leave_days: number
          total_deductions: number
        }
        Insert: {
          basic_salary: number
          company_id: string
          created_at?: string
          daily_rate: number
          days_worked: number
          deductions?: Json | null
          employee_id: string
          generated_by?: string | null
          gross_salary: number
          id?: string
          month: string
          net_salary: number
          notes?: string | null
          overtime_earnings?: number | null
          overtime_hours?: number | null
          present_days?: number
          short_leave_days?: number
          total_deductions?: number
        }
        Update: {
          basic_salary?: number
          company_id?: string
          created_at?: string
          daily_rate?: number
          days_worked?: number
          deductions?: Json | null
          employee_id?: string
          generated_by?: string | null
          gross_salary?: number
          id?: string
          month?: string
          net_salary?: number
          notes?: string | null
          overtime_earnings?: number | null
          overtime_hours?: number | null
          present_days?: number
          short_leave_days?: number
          total_deductions?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          first_name: string | null
          id: string
          is_admin: boolean
          last_name: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          is_admin?: boolean
          last_name?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_admin?: boolean
          last_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_config: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          holiday_multiplier: number
          id: string
          max_daily_hours: number
          max_monthly_hours: number
          regular_multiplier: number
          tier: Database["public"]["Enums"]["employee_tier"]
          tier_name: string
          updated_at: string
          weekend_multiplier: number
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          holiday_multiplier?: number
          id?: string
          max_daily_hours?: number
          max_monthly_hours?: number
          regular_multiplier?: number
          tier: Database["public"]["Enums"]["employee_tier"]
          tier_name: string
          updated_at?: string
          weekend_multiplier?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          holiday_multiplier?: number
          id?: string
          max_daily_hours?: number
          max_monthly_hours?: number
          regular_multiplier?: number
          tier?: Database["public"]["Enums"]["employee_tier"]
          tier_name?: string
          updated_at?: string
          weekend_multiplier?: number
        }
        Relationships: []
      }
      working_days_config: {
        Row: {
          company_id: string
          created_at: string
          friday: boolean
          monday: boolean
          saturday: boolean
          sunday: boolean
          thursday: boolean
          tuesday: boolean
          updated_at: string
          wednesday: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          friday?: boolean
          monday?: boolean
          saturday?: boolean
          sunday?: boolean
          thursday?: boolean
          tuesday?: boolean
          updated_at?: string
          wednesday?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          friday?: boolean
          monday?: boolean
          saturday?: boolean
          sunday?: boolean
          thursday?: boolean
          tuesday?: boolean
          updated_at?: string
          wednesday?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "working_days_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      employee_login: {
        Args: { p_cnic: string; p_password: string }
        Returns: Json
      }
      get_employee_portal_data: { Args: { p_emp_id: string }; Returns: Json }
      get_employee_working_days_for_month: {
        Args: { target_employee_id: string; target_month: string }
        Returns: {
          daily_rate_divisor: number
          total_working_days: number
          working_dates: string[]
        }[]
      }
      get_monthly_salary_stats: {
        Args: { in_company_id: string; target_month: string }
        Returns: {
          average_daily_rate: number
          employee_count: number
          total_budget_salary: number
          total_calculated_salary: number
        }[]
      }
      get_user_company_id: { Args: { user_id: string }; Returns: string }
      get_user_profile: {
        Args: { user_id: string }
        Returns: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          first_name: string | null
          id: string
          is_admin: boolean
          last_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_working_days_for_month: {
        Args: { target_company_id: string; target_month: string }
        Returns: {
          daily_rate_divisor: number
          total_working_days: number
          working_dates: string[]
        }[]
      }
      initialize_tier_config: {
        Args: { target_company_id: string }
        Returns: undefined
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      process_update_request: {
        Args: { p_req_id: string; p_status: string }
        Returns: Json
      }
      submit_update_request: {
        Args: { p_changes: Json; p_emp_id: string }
        Returns: Json
      }
      update_employee_password: {
        Args: {
          p_emp_id: string
          p_new_password: string
          p_old_password: string
        }
        Returns: Json
      }
    }
    Enums: {
      document_type: "contract" | "id_copy" | "certificate" | "resume" | "other"
      employee_tier: "tier_a" | "tier_b" | "tier_c"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type_enum:
        | "annual"
        | "sick"
        | "unpaid"
        | "maternity"
        | "paternity"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      document_type: ["contract", "id_copy", "certificate", "resume", "other"],
      employee_tier: ["tier_a", "tier_b", "tier_c"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type_enum: [
        "annual",
        "sick",
        "unpaid",
        "maternity",
        "paternity",
        "other",
      ],
    },
  },
} as const
