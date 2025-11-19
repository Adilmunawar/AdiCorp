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
          created_at: string
          currency: string | null
          id: string
          logo: string | null
          name: string
          phone: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          logo?: string | null
          name: string
          phone?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
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
      employees: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          rank: string
          status: string
          user_id: string | null
          wage_rate: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          rank: string
          status?: string
          user_id?: string | null
          wage_rate: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          rank?: string
          status?: string
          user_id?: string | null
          wage_rate?: number
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
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          first_name: string | null
          id: string
          is_admin: boolean
          last_name: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          is_admin?: boolean
          last_name?: string | null
        }
        Update: {
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
      is_admin: { Args: { user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
