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
          employee_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          company_id: string
          created_at?: string
          description: string
          details?: Json | null
          employee_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          description?: string
          details?: Json | null
          employee_id?: string | null
          id?: string
          user_id?: string | null
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
            foreignKeyName: "activity_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      announcements: {
        Row: {
          audience: string
          company_id: string
          content: string
          created_at: string
          created_by: string
          department_id: string | null
          id: string
          is_active: boolean
          pinned: boolean
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          company_id: string
          content: string
          created_at?: string
          created_by: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          pinned?: boolean
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          company_id?: string
          content?: string
          created_at?: string
          created_by?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          pinned?: boolean
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_assignments: {
        Row: {
          asset_id: string
          assigned_by: string | null
          assigned_on: string
          company_id: string
          condition_in: string | null
          condition_out: string | null
          created_at: string
          employee_id: string
          id: string
          note_in: string | null
          note_out: string | null
          returned_by: string | null
          returned_on: string | null
        }
        Insert: {
          asset_id: string
          assigned_by?: string | null
          assigned_on: string
          company_id: string
          condition_in?: string | null
          condition_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          note_in?: string | null
          note_out?: string | null
          returned_by?: string | null
          returned_on?: string | null
        }
        Update: {
          asset_id?: string
          assigned_by?: string | null
          assigned_on?: string
          company_id?: string
          condition_in?: string | null
          condition_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          note_in?: string | null
          note_out?: string | null
          returned_by?: string | null
          returned_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          assigned_on: string | null
          brand: string | null
          category: string
          company_id: string
          condition: string
          created_at: string
          created_by: string | null
          employee_id: string | null
          id: string
          location: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          serial_number: string | null
          specs: string | null
          status: string
          tag: string
          updated_at: string
          warranty_until: string | null
        }
        Insert: {
          assigned_on?: string | null
          brand?: string | null
          category?: string
          company_id: string
          condition?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          location?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          specs?: string | null
          status?: string
          tag: string
          updated_at?: string
          warranty_until?: string | null
        }
        Update: {
          assigned_on?: string | null
          brand?: string | null
          category?: string
          company_id?: string
          condition?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          location?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          specs?: string | null
          status?: string
          tag?: string
          updated_at?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          company_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          leave_request_id: string | null
          marked_by: string | null
          note: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          employee_id: string
          id?: string
          leave_request_id?: string | null
          marked_by?: string | null
          note?: string | null
          source?: string
          status: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          leave_request_id?: string | null
          marked_by?: string | null
          note?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      celebration_greetings: {
        Row: {
          company_id: string
          employee_id: string
          id: string
          kind: string
          occasion_date: string
          sent_at: string
        }
        Insert: {
          company_id: string
          employee_id: string
          id?: string
          kind: string
          occasion_date: string
          sent_at?: string
        }
        Update: {
          company_id?: string
          employee_id?: string
          id?: string
          kind?: string
          occasion_date?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "celebration_greetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_greetings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      celebration_wishes: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          from_employee_id: string | null
          from_user_id: string | null
          id: string
          kind: string
          message: string | null
          occasion_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          from_employee_id?: string | null
          from_user_id?: string | null
          id?: string
          kind: string
          message?: string | null
          occasion_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          from_employee_id?: string | null
          from_user_id?: string | null
          id?: string
          kind?: string
          message?: string | null
          occasion_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "celebration_wishes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_wishes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_wishes_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebration_wishes_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_steps: {
        Row: {
          auto_key: string | null
          company_id: string
          created_at: string
          description: string | null
          due_offset_days: number
          id: string
          position: number
          template_id: string
          title: string
        }
        Insert: {
          auto_key?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          position?: number
          template_id: string
          title: string
        }
        Update: {
          auto_key?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          position?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          default_due_days: number
          description: string | null
          id: string
          is_default: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          default_due_days?: number
          description?: string | null
          id?: string
          is_default?: boolean
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          default_due_days?: number
          description?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          company_size: string | null
          company_type: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          id: string
          legal_name: string | null
          logo: string | null
          name: string
          phone: string | null
          slug: string
          tax_id: string | null
          timezone: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company_size?: string | null
          company_type?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          legal_name?: string | null
          logo?: string | null
          name: string
          phone?: string | null
          slug: string
          tax_id?: string | null
          timezone?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company_size?: string | null
          company_type?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          id?: string
          legal_name?: string | null
          logo?: string | null
          name?: string
          phone?: string | null
          slug?: string
          tax_id?: string | null
          timezone?: string
          website?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          hours_threshold_pct: number
          leave_requires_approval: boolean
          letter_reference_prefix: string
          letter_signatory_name: string | null
          letter_signatory_title: string | null
          require_push_notifications: boolean
          require_staff_mfa: boolean
          saturday_off_from: string | null
          saturday_off_until: string | null
          saturday_policy: string
          self_service_edits: boolean
          sunday_off: boolean
          updated_at: string
          updated_by: string | null
          working_hours_per_day: number
        }
        Insert: {
          company_id: string
          created_at?: string
          hours_threshold_pct?: number
          leave_requires_approval?: boolean
          letter_reference_prefix?: string
          letter_signatory_name?: string | null
          letter_signatory_title?: string | null
          require_push_notifications?: boolean
          require_staff_mfa?: boolean
          saturday_off_from?: string | null
          saturday_off_until?: string | null
          saturday_policy?: string
          self_service_edits?: boolean
          sunday_off?: boolean
          updated_at?: string
          updated_by?: string | null
          working_hours_per_day?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          hours_threshold_pct?: number
          leave_requires_approval?: boolean
          letter_reference_prefix?: string
          letter_signatory_name?: string | null
          letter_signatory_title?: string | null
          require_push_notifications?: boolean
          require_staff_mfa?: boolean
          saturday_off_from?: string | null
          saturday_off_until?: string | null
          saturday_policy?: string
          self_service_edits?: boolean
          sunday_off?: boolean
          updated_at?: string
          updated_by?: string | null
          working_hours_per_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_working_settings: {
        Row: {
          company_id: string
          created_at: string
          default_working_days_per_month: number
          default_working_days_per_week: number
          salary_divisor: number
          saturday_off_from: string | null
          saturday_off_until: string | null
          saturday_pattern: string
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
          saturday_off_from?: string | null
          saturday_off_until?: string | null
          saturday_pattern?: string
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
          saturday_off_from?: string | null
          saturday_off_until?: string | null
          saturday_pattern?: string
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
      complaints: {
        Row: {
          company_id: string
          created_at: string
          description: string
          employee_id: string | null
          id: string
          is_anonymous: boolean
          responded_at: string | null
          responded_by: string | null
          response: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          employee_id?: string | null
          id?: string
          is_anonymous?: boolean
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          employee_id?: string | null
          id?: string
          is_anonymous?: boolean
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_checklist_items: {
        Row: {
          auto_key: string | null
          checklist_id: string
          company_id: string
          created_at: string
          description: string | null
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          position: number
          title: string
          touched: boolean
        }
        Insert: {
          auto_key?: string | null
          checklist_id: string
          company_id: string
          created_at?: string
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          position?: number
          title: string
          touched?: boolean
        }
        Update: {
          auto_key?: string | null
          checklist_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          position?: number
          title?: string
          touched?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "employee_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_checklist_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_checklists: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          due_date: string | null
          employee_id: string
          id: string
          kind: string
          note: string | null
          start_date: string
          started_at: string
          started_by: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          due_date?: string | null
          employee_id: string
          id?: string
          kind: string
          note?: string | null
          start_date?: string
          started_at?: string
          started_by?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          due_date?: string | null
          employee_id?: string
          id?: string
          kind?: string
          note?: string | null
          start_date?: string
          started_at?: string
          started_by?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_checklists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_checklists_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
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
          expires_on: string | null
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
          expires_on?: string | null
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
          expires_on?: string | null
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
      employee_sessions: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          expires_at: string
          last_seen_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          expires_at: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          expires_at?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_update_requests: {
        Row: {
          company_id: string | null
          created_at: string | null
          decisions: Json | null
          employee_id: string | null
          id: string
          note: string | null
          requested_changes: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          decisions?: Json | null
          employee_id?: string | null
          id?: string
          note?: string | null
          requested_changes: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          decisions?: Json | null
          employee_id?: string | null
          id?: string
          note?: string | null
          requested_changes?: Json
          review_note?: string | null
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
          address: string | null
          avatar_url: string | null
          bank_account_number: string | null
          bank_name: string | null
          cnic: string | null
          company_id: string
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          education: string | null
          email: string | null
          emergency_contact: string | null
          employee_code: string | null
          father_name: string | null
          gender: string | null
          id: string
          joining_date: string | null
          must_change_password: boolean
          name: string
          notes: string | null
          password: string | null
          password_hash: string | null
          phone: string | null
          rank: string
          salary_divisor: number | null
          separation_date: string | null
          share_birthday: boolean
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
          address?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cnic?: string | null
          company_id: string
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          education?: string | null
          email?: string | null
          emergency_contact?: string | null
          employee_code?: string | null
          father_name?: string | null
          gender?: string | null
          id?: string
          joining_date?: string | null
          must_change_password?: boolean
          name: string
          notes?: string | null
          password?: string | null
          password_hash?: string | null
          phone?: string | null
          rank: string
          salary_divisor?: number | null
          separation_date?: string | null
          share_birthday?: boolean
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
        Update: {
          address?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cnic?: string | null
          company_id?: string
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          education?: string | null
          email?: string | null
          emergency_contact?: string | null
          employee_code?: string | null
          father_name?: string | null
          gender?: string | null
          id?: string
          joining_date?: string | null
          must_change_password?: boolean
          name?: string
          notes?: string | null
          password?: string | null
          password_hash?: string | null
          phone?: string | null
          rank?: string
          salary_divisor?: number | null
          separation_date?: string | null
          share_birthday?: boolean
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
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          affects_attendance: boolean
          company_id: string
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          end_date: string | null
          id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          affects_attendance?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          end_date?: string | null
          id?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          affects_attendance?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          end_date?: string | null
          id?: string
          title?: string
          type?: string
          updated_at?: string
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
      expense_files: {
        Row: {
          company_id: string
          created_at: string
          expense_id: string
          file_name: string
          file_size: number
          id: string
          kind: string
          mime_type: string
          payment_id: string | null
          storage_path: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          expense_id: string
          file_name: string
          file_size?: number
          id?: string
          kind: string
          mime_type?: string
          payment_id?: string | null
          storage_path: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          expense_id?: string
          file_name?: string
          file_size?: number
          id?: string
          kind?: string
          mime_type?: string
          payment_id?: string | null
          storage_path?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_files_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_files_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "expense_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          expense_id: string
          id: string
          method: string
          note: string
          paid_on: string
          reference: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          expense_id: string
          id?: string
          method: string
          note?: string
          paid_on: string
          reference?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          expense_id?: string
          id?: string
          method?: string
          note?: string
          paid_on?: string
          reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          benefit: string
          billing: string
          category: string
          company_id: string
          completed_at: string | null
          created_at: string
          currency: string
          employee_id: string | null
          end_date: string | null
          ended_on: string | null
          finance_at: string | null
          finance_by: string | null
          finance_by_name: string | null
          finance_note: string
          hr_at: string | null
          hr_by: string | null
          hr_by_name: string | null
          hr_note: string
          id: string
          last_paid_on: string | null
          link: string
          outcome: string
          payments_count: number
          provider: string
          purpose: string
          reimburse: boolean
          renews_on: string | null
          requested_by: string | null
          requested_by_name: string | null
          source: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          benefit?: string
          billing?: string
          category: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          currency: string
          employee_id?: string | null
          end_date?: string | null
          ended_on?: string | null
          finance_at?: string | null
          finance_by?: string | null
          finance_by_name?: string | null
          finance_note?: string
          hr_at?: string | null
          hr_by?: string | null
          hr_by_name?: string | null
          hr_note?: string
          id?: string
          last_paid_on?: string | null
          link?: string
          outcome?: string
          payments_count?: number
          provider?: string
          purpose?: string
          reimburse?: boolean
          renews_on?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          source: string
          start_date?: string | null
          status: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          benefit?: string
          billing?: string
          category?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          employee_id?: string | null
          end_date?: string | null
          ended_on?: string | null
          finance_at?: string | null
          finance_by?: string | null
          finance_by_name?: string | null
          finance_note?: string
          hr_at?: string | null
          hr_by?: string | null
          hr_by_name?: string | null
          hr_note?: string
          id?: string
          last_paid_on?: string | null
          link?: string
          outcome?: string
          payments_count?: number
          provider?: string
          purpose?: string
          reimburse?: boolean
          renews_on?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          source?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      hr_letters: {
        Row: {
          acknowledged_at: string | null
          body: string
          company_id: string
          employee_id: string
          facts: Json
          id: string
          issued_at: string
          issued_by: string | null
          issued_by_name: string | null
          kind: string
          period: string | null
          ref: string
          replied_at: string | null
          reply: string
          reply_by: string | null
          signatory_name: string
          signatory_title: string
          subject: string
          withdraw_reason: string
          withdrawn_at: string | null
          withdrawn_by: string | null
          withdrawn_by_name: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          body: string
          company_id: string
          employee_id: string
          facts?: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_by_name?: string | null
          kind: string
          period?: string | null
          ref: string
          replied_at?: string | null
          reply?: string
          reply_by?: string | null
          signatory_name: string
          signatory_title: string
          subject: string
          withdraw_reason?: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_by_name?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          body?: string
          company_id?: string
          employee_id?: string
          facts?: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_by_name?: string | null
          kind?: string
          period?: string | null
          ref?: string
          replied_at?: string | null
          reply?: string
          reply_by?: string | null
          signatory_name?: string
          signatory_title?: string
          subject?: string
          withdraw_reason?: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_letters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_letters_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_letters_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_letters_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_application_notes: {
        Row: {
          application_id: string
          author_id: string | null
          author_name: string
          body: string
          company_id: string
          created_at: string
          id: string
          kind: string
        }
        Insert: {
          application_id: string
          author_id?: string | null
          author_name?: string
          body: string
          company_id: string
          created_at?: string
          id?: string
          kind?: string
        }
        Update: {
          application_id?: string
          author_id?: string | null
          author_name?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_application_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_application_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          company_id: string
          cover_letter: string
          created_at: string
          cv_name: string | null
          cv_path: string | null
          cv_size: number | null
          email: string
          employee_id: string | null
          id: string
          ip_hash: string | null
          job_id: string
          link: string
          name: string
          phone: string
          rating: number | null
          status: string
          status_changed_at: string
          updated_at: string
        }
        Insert: {
          company_id: string
          cover_letter?: string
          created_at?: string
          cv_name?: string | null
          cv_path?: string | null
          cv_size?: number | null
          email: string
          employee_id?: string | null
          id?: string
          ip_hash?: string | null
          job_id: string
          link?: string
          name: string
          phone?: string
          rating?: number | null
          status?: string
          status_changed_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          cover_letter?: string
          created_at?: string
          cv_name?: string | null
          cv_path?: string | null
          cv_size?: number | null
          email?: string
          employee_id?: string | null
          id?: string
          ip_hash?: string | null
          job_id?: string
          link?: string
          name?: string
          phone?: string
          rating?: number | null
          status?: string
          status_changed_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          closes_on: string | null
          company_id: string
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string
          employment_type: string
          id: string
          location: string
          openings: number
          requirements: string
          slug: string
          status: string
          summary: string
          title: string
          updated_at: string
          workplace: string
        }
        Insert: {
          closes_on?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string
          employment_type?: string
          id?: string
          location?: string
          openings?: number
          requirements?: string
          slug: string
          status?: string
          summary?: string
          title: string
          updated_at?: string
          workplace?: string
        }
        Update: {
          closes_on?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string
          employment_type?: string
          id?: string
          location?: string
          openings?: number
          requirements?: string
          slug?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          workplace?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          company_id: string
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
          company_id: string
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
          company_id?: string
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
            foreignKeyName: "leave_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          requested_by: string | null
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
          requested_by?: string | null
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
          requested_by?: string | null
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
            foreignKeyName: "leave_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      leave_settings: {
        Row: {
          company_id: string
          requires_approval: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          requires_approval?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          requires_approval?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_settings_updated_by_fkey"
            columns: ["updated_by"]
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
      letter_settings: {
        Row: {
          company_id: string
          ref_prefix: string
          ref_seq: number
          ref_year: number
          signatory_name: string
          signatory_title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          ref_prefix: string
          ref_seq?: number
          ref_year?: number
          signatory_name?: string
          signatory_title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          ref_prefix?: string
          ref_seq?: number
          ref_year?: number
          signatory_name?: string
          signatory_title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "letter_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          employee_id: string
          id: string
          read_at: string | null
          sender_kind: string
          sender_user_id: string | null
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          employee_id: string
          id?: string
          read_at?: string | null
          sender_kind: string
          sender_user_id?: string | null
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          employee_id?: string
          id?: string
          read_at?: string | null
          sender_kind?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          employee_id: string | null
          href: string | null
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          employee_id?: string | null
          href?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string | null
          href?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          claimed_hours: number | null
          company_id: string
          created_at: string
          date: string
          employee_id: string
          hourly_rate: number
          hours: number
          id: string
          multiplier: number
          overtime_type: string
          pay_status: string
          payslip_id: string | null
          priced_at: string | null
          priced_by: string | null
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
          claimed_hours?: number | null
          company_id: string
          created_at?: string
          date: string
          employee_id: string
          hourly_rate?: number
          hours: number
          id?: string
          multiplier?: number
          overtime_type?: string
          pay_status?: string
          payslip_id?: string | null
          priced_at?: string | null
          priced_by?: string | null
          reason?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          claimed_hours?: number | null
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          hourly_rate?: number
          hours?: number
          id?: string
          multiplier?: number
          overtime_type?: string
          pay_status?: string
          payslip_id?: string | null
          priced_at?: string | null
          priced_by?: string | null
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
          {
            foreignKeyName: "overtime_records_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payslips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_priced_by_fkey"
            columns: ["priced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_events: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          detail: string | null
          done_at: string | null
          done_by: string | null
          effective_date: string | null
          employee_id: string
          id: string
          kind: string
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          done_at?: string | null
          done_by?: string | null
          effective_date?: string | null
          employee_id: string
          id?: string
          kind: string
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          done_at?: string | null
          done_by?: string | null
          effective_date?: string | null
          employee_id?: string
          id?: string
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          company_id: string
          rules: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          rules?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          rules?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          absent_days: number
          allowances: number
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
          income_tax: number
          legacy: boolean
          lines: Json
          month: string
          month_days: number | null
          net_salary: number
          notes: string | null
          notes_auto: boolean
          other_allowances: number
          other_basis: number
          other_deductions: number
          overtime_basis: number
          overtime_earnings: number | null
          overtime_hours: number | null
          paid_days: number | null
          paid_leave_days: number
          paid_on: string | null
          pay_method: string
          present_days: number
          published_at: string | null
          salary_basis: number
          seen_at: string | null
          short_leave_days: number
          status: string
          tax_manual: boolean
          taxable_income: number
          total_deductions: number
          updated_at: string
        }
        Insert: {
          absent_days?: number
          allowances?: number
          basic_salary?: number
          company_id: string
          created_at?: string
          daily_rate?: number
          days_worked?: number
          deductions?: Json | null
          employee_id: string
          generated_by?: string | null
          gross_salary?: number
          id?: string
          income_tax?: number
          legacy?: boolean
          lines?: Json
          month: string
          month_days?: number | null
          net_salary?: number
          notes?: string | null
          notes_auto?: boolean
          other_allowances?: number
          other_basis?: number
          other_deductions?: number
          overtime_basis?: number
          overtime_earnings?: number | null
          overtime_hours?: number | null
          paid_days?: number | null
          paid_leave_days?: number
          paid_on?: string | null
          pay_method?: string
          present_days?: number
          published_at?: string | null
          salary_basis?: number
          seen_at?: string | null
          short_leave_days?: number
          status?: string
          tax_manual?: boolean
          taxable_income?: number
          total_deductions?: number
          updated_at?: string
        }
        Update: {
          absent_days?: number
          allowances?: number
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
          income_tax?: number
          legacy?: boolean
          lines?: Json
          month?: string
          month_days?: number | null
          net_salary?: number
          notes?: string | null
          notes_auto?: boolean
          other_allowances?: number
          other_basis?: number
          other_deductions?: number
          overtime_basis?: number
          overtime_earnings?: number | null
          overtime_hours?: number | null
          paid_days?: number | null
          paid_leave_days?: number
          paid_on?: string | null
          pay_method?: string
          present_days?: number
          published_at?: string | null
          salary_basis?: number
          seen_at?: string | null
          short_leave_days?: number
          status?: string
          tax_manual?: boolean
          taxable_income?: number
          total_deductions?: number
          updated_at?: string
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
      policies: {
        Row: {
          archived_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          requires_signature: boolean
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          requires_signature?: boolean
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          requires_signature?: boolean
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_signatures: {
        Row: {
          body_sha256: string
          company_id: string
          employee_id: string
          id: string
          ip: string | null
          policy_id: string
          signature_bytes: number
          signature_png: string
          signed_at: string
          signed_name: string
          user_agent: string | null
          version_id: string
        }
        Insert: {
          body_sha256: string
          company_id: string
          employee_id: string
          id?: string
          ip?: string | null
          policy_id: string
          signature_bytes: number
          signature_png: string
          signed_at?: string
          signed_name: string
          user_agent?: string | null
          version_id: string
        }
        Update: {
          body_sha256?: string
          company_id?: string
          employee_id?: string
          id?: string
          ip?: string | null
          policy_id?: string
          signature_bytes?: number
          signature_png?: string
          signed_at?: string
          signed_name?: string
          user_agent?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_signatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_signatures_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_signatures_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_versions: {
        Row: {
          body: string
          body_sha256: string | null
          change_note: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          policy_id: string
          published_at: string | null
          published_by: string | null
          published_by_name: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          body?: string
          body_sha256?: string | null
          change_note?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          policy_id: string
          published_at?: string | null
          published_by?: string | null
          published_by_name?: string | null
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          body?: string
          body_sha256?: string | null
          change_note?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          policy_id?: string
          published_at?: string | null
          published_by?: string | null
          published_by_name?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_versions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          company_id: string
          created_at: string
          id: string
          option_text: string
          poll_id: string
          position: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          option_text: string
          poll_id: string
          position?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          option_text?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          id: string
          option_id: string
          poll_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          option_id: string
          poll_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          option_id?: string
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_option_poll_fkey"
            columns: ["option_id", "poll_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id", "poll_id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          expires_at: string | null
          id: string
          question: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          expires_at?: string | null
          id?: string
          question: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          question?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_login_attempts: {
        Row: {
          attempted_at: string
          cnic_key: string
          id: number
          ip: string | null
          succeeded: boolean
        }
        Insert: {
          attempted_at?: string
          cnic_key: string
          id?: never
          ip?: string | null
          succeeded?: boolean
        }
        Update: {
          attempted_at?: string
          cnic_key?: string
          id?: never
          ip?: string | null
          succeeded?: boolean
        }
        Relationships: []
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
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          is_admin?: boolean
          last_name?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_admin?: boolean
          last_name?: string | null
          role?: string | null
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
      punch_corrections: {
        Row: {
          company_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          kind: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          time_in: string | null
          time_out: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          employee_id: string
          id?: string
          kind: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          time_in?: string | null
          time_out?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          kind?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          time_in?: string | null
          time_out?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          company_id: string
          created_at: string
          device: string
          employee_id: string | null
          endpoint: string
          failures: number
          id: string
          last_error: string | null
          last_ok_at: string | null
          p256dh: string
          user_id: string | null
        }
        Insert: {
          auth: string
          company_id: string
          created_at?: string
          device?: string
          employee_id?: string | null
          endpoint: string
          failures?: number
          id?: string
          last_error?: string | null
          last_ok_at?: string | null
          p256dh: string
          user_id?: string | null
        }
        Update: {
          auth?: string
          company_id?: string
          created_at?: string
          device?: string
          employee_id?: string | null
          endpoint?: string
          failures?: number
          id?: string
          last_error?: string | null
          last_ok_at?: string | null
          p256dh?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_history: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          employee_id: string
          id: string
          monthly_salary: number
          other_allowance: number
          pay_method: string
          reason: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          employee_id: string
          id?: string
          monthly_salary: number
          other_allowance?: number
          pay_method?: string
          reason?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          employee_id?: string
          id?: string
          monthly_salary?: number
          other_allowance?: number
          pay_method?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
        Relationships: [
          {
            foreignKeyName: "tier_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_device_keys: {
        Row: {
          company_id: string
          created_at: string
          device_id: string
          key_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          device_id: string
          key_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          device_id?: string
          key_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_device_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_device_keys_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "time_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      time_devices: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          direction: string
          firmware: string | null
          id: string
          is_active: boolean
          key_prefix: string
          last_error: string | null
          last_ip: string | null
          last_punch_at: string | null
          last_seen_at: string | null
          location: string | null
          name: string
          serial: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          direction?: string
          firmware?: string | null
          id?: string
          is_active?: boolean
          key_prefix: string
          last_error?: string | null
          last_ip?: string | null
          last_punch_at?: string | null
          last_seen_at?: string | null
          location?: string | null
          name: string
          serial?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          firmware?: string | null
          id?: string
          is_active?: boolean
          key_prefix?: string
          last_error?: string | null
          last_ip?: string | null
          last_punch_at?: string | null
          last_seen_at?: string | null
          location?: string | null
          name?: string
          serial?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_punches: {
        Row: {
          company_id: string
          correction_id: string | null
          device_id: string | null
          device_ref: string
          device_user_id: string
          direction: string
          employee_id: string | null
          id: string
          punch_at: string
          punch_date: string
          received_at: string
          source: string
          verify_type: string | null
        }
        Insert: {
          company_id: string
          correction_id?: string | null
          device_id?: string | null
          device_ref: string
          device_user_id: string
          direction?: string
          employee_id?: string | null
          id?: string
          punch_at: string
          punch_date: string
          received_at?: string
          source?: string
          verify_type?: string | null
        }
        Update: {
          company_id?: string
          correction_id?: string | null
          device_id?: string | null
          device_ref?: string
          device_user_id?: string
          direction?: string
          employee_id?: string | null
          id?: string
          punch_at?: string
          punch_date?: string
          received_at?: string
          source?: string
          verify_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_punches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "punch_corrections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "time_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_settings: {
        Row: {
          auto_present: boolean
          company_id: string
          created_at: string
          evening_start: string
          grace_minutes: number
          hours_per_day: number
          hours_threshold_pct: number
          locked_through: string | null
          morning_start: string
          night_start: string
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_present?: boolean
          company_id: string
          created_at?: string
          evening_start?: string
          grace_minutes?: number
          hours_per_day?: number
          hours_threshold_pct?: number
          locked_through?: string | null
          morning_start?: string
          night_start?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_present?: boolean
          company_id?: string
          created_at?: string
          evening_start?: string
          grace_minutes?: number
          hours_per_day?: number
          hours_threshold_pct?: number
          locked_through?: string | null
          morning_start?: string
          night_start?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_terminal_links: {
        Row: {
          auto: boolean
          company_id: string
          created_at: string
          device_user_id: string
          employee_id: string
          linked_by: string | null
        }
        Insert: {
          auto?: boolean
          company_id: string
          created_at?: string
          device_user_id: string
          employee_id: string
          linked_by?: string | null
        }
        Update: {
          auto?: boolean
          company_id?: string
          created_at?: string
          device_user_id?: string
          employee_id?: string
          linked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_terminal_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_terminal_links_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      _careers_actor_name: { Args: never; Returns: string }
      _careers_require_hr: { Args: never; Returns: string }
      _careers_status_label: { Args: { p_status: string }; Returns: string }
      _engagement_chat_topic: { Args: { p_employee: string }; Returns: string }
      _engagement_notify_employees: {
        Args: {
          p_body: string
          p_company: string
          p_department: string
          p_href: string
          p_kind: string
          p_title: string
        }
        Returns: number
      }
      _engagement_occasions: {
        Args: { p_company: string; p_from: string; p_to: string }
        Returns: {
          avatar_url: string
          department: string
          employee_id: string
          kind: string
          name: string
          on_date: string
          rank: string
          shared: boolean
          years: number
        }[]
      }
      _engagement_ping_thread: {
        Args: { p_employee: string; p_message: string }
        Returns: undefined
      }
      _engagement_plain: { Args: { p_text: string }; Returns: string }
      _engagement_poll_json: {
        Args: {
          p_poll: Database["public"]["Tables"]["polls"]["Row"]
          p_with_counts: boolean
        }
        Returns: Json
      }
      _engagement_portal_log: {
        Args: {
          p_action: string
          p_description: string
          p_details?: Json
          p_employee: Database["public"]["Tables"]["employees"]["Row"]
        }
        Returns: undefined
      }
      _engagement_require_hr: { Args: never; Returns: string }
      _engagement_staff_name: { Args: { p_user: string }; Returns: string }
      _engagement_today: { Args: never; Returns: string }
      _expense_actor_name: { Args: never; Returns: string }
      _expense_add_file: {
        Args: {
          p_by: string
          p_by_name: string
          p_company: string
          p_expense: string
          p_file: Json
          p_kind: string
          p_payment: string
        }
        Returns: undefined
      }
      _expense_category_label: {
        Args: { p_category: string; p_short?: boolean }
        Returns: string
      }
      _expense_clean: { Args: { p: Json; p_explain: boolean }; Returns: Json }
      _expense_day: { Args: { p_date: string }; Returns: string }
      _expense_employee_name: { Args: { p_employee: string }; Returns: string }
      _expense_file_clean: {
        Args: {
          p_company: string
          p_file: Json
          p_kind: string
          p_owner: string
        }
        Returns: Json
      }
      _expense_log_employee: {
        Args: {
          p_action: string
          p_company: string
          p_description: string
          p_details: Json
          p_employee: string
        }
        Returns: undefined
      }
      _expense_money: {
        Args: { p_amount: number; p_currency: string }
        Returns: string
      }
      _expense_pay: {
        Args: { p_id: string; p_notify: boolean; p_pay: Json }
        Returns: string
      }
      _expense_payment_clean: {
        Args: { p: Json; p_currency: string; p_has_employee: boolean }
        Returns: Json
      }
      _expense_portal_json: {
        Args: { p_x: Database["public"]["Tables"]["expenses"]["Row"] }
        Returns: Json
      }
      _expense_renewal: { Args: { p_id: string }; Returns: string }
      _leave_actor_name: { Args: never; Returns: string }
      _leave_after_approval: {
        Args: { p_automatic: boolean; p_days: number; p_id: string }
        Returns: undefined
      }
      _leave_balance_rows: {
        Args: { p_company: string; p_employee: string; p_year: number }
        Returns: {
          allowed: number
          avatar_url: string
          custom: boolean
          default_days: number
          department: string
          employee_code: string
          employee_id: string
          employee_name: string
          is_paid: boolean
          leave_type_id: string
          pending: number
          remaining: number
          type_kind: string
          type_name: string
          unlimited: boolean
          used: number
        }[]
      }
      _leave_create: {
        Args: {
          p_company: string
          p_employee: string
          p_end: string
          p_leave_type: string
          p_reason: string
          p_requested_by: string
          p_start: string
        }
        Returns: {
          company_id: string
          created_at: string
          days_count: number
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          requested_by: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _leave_day_word: { Args: { p_days: number }; Returns: string }
      _leave_locked_month: {
        Args: { p_employee: string; p_end: string; p_start: string }
        Returns: string
      }
      _leave_log_portal: {
        Args: {
          p_action: string
          p_company: string
          p_description: string
          p_details: Json
          p_employee: string
        }
        Returns: undefined
      }
      _leave_pay_event: {
        Args: {
          p_company: string
          p_detail: string
          p_effective: string
          p_employee: string
          p_kind: string
          p_title: string
        }
        Returns: undefined
      }
      _leave_require_hr: { Args: never; Returns: string }
      _leave_set_status: {
        Args: {
          p_id: string
          p_note: string
          p_reviewer: string
          p_status: Database["public"]["Enums"]["leave_status"]
        }
        Returns: number
      }
      _leave_today: { Args: { p_company: string }; Returns: string }
      _leave_when: { Args: { p_end: string; p_start: string }; Returns: string }
      _leave_working_dates: {
        Args: { p_employee: string; p_end: string; p_start: string }
        Returns: string[]
      }
      _letters_default_prefix: { Args: { p_company: string }; Returns: string }
      _letters_is_workday: {
        Args: { p_company: string; p_day: string }
        Returns: boolean
      }
      _letters_label: { Args: { p_kind: string }; Returns: string }
      _notify_assert_company: {
        Args: { p_company: string }
        Returns: undefined
      }
      _ot_check: {
        Args: {
          p_company: string
          p_date: string
          p_hours: number
          p_type: string
        }
        Returns: undefined
      }
      _ot_hours_label: { Args: { p_hours: number }; Returns: string }
      _ot_locked: { Args: { p_payslip: string }; Returns: boolean }
      _ot_tell_finance: {
        Args: {
          p_company: string
          p_date: string
          p_employee_name: string
          p_hours: number
        }
        Returns: undefined
      }
      _payroll_assert_finance: { Args: never; Returns: string }
      _payroll_attendance: {
        Args: { p_employee: string; p_month: string }
        Returns: Json
      }
      _payroll_breakdown: {
        Args: { p_rules: Json; p_salary: number }
        Returns: Json
      }
      _payroll_clean_lines: { Args: { p_lines: Json }; Returns: Json }
      _payroll_clean_rules: {
        Args: { p_default: Json; p_raw: Json }
        Returns: Json
      }
      _payroll_day_label: { Args: { p_day: string }; Returns: string }
      _payroll_default_rules: { Args: { p_company: string }; Returns: Json }
      _payroll_fmt: {
        Args: { p_amount: number; p_currency: string }
        Returns: string
      }
      _payroll_month_label: { Args: { p_month: string }; Returns: string }
      _payroll_month_pay: {
        Args: { p_employee: string; p_month: string }
        Returns: Json
      }
      _payroll_multiplier: {
        Args: { p_rules: Json; p_type: string }
        Returns: number
      }
      _payroll_num: { Args: { p: Json }; Returns: number }
      _payroll_ot_amount: {
        Args: { p_hours: number; p_multiplier: number; p_rate: number }
        Returns: number
      }
      _payroll_ot_claim: {
        Args: { p_employee: string; p_end: string; p_payslip: string }
        Returns: undefined
      }
      _payroll_ot_on_slip: { Args: { p_payslip: string }; Returns: Json }
      _payroll_ot_payable: {
        Args: { p_employee: string; p_end: string; p_payslip: string }
        Returns: Json
      }
      _payroll_prepare: {
        Args: {
          p_currency: string
          p_employee: string
          p_month: string
          p_rules: Json
        }
        Returns: Json
      }
      _payroll_prorated_note: {
        Args: { p_currency: string; p_pay: Json }
        Returns: string
      }
      _payroll_refill: {
        Args: { p_currency: string; p_payslip: string; p_rules: Json }
        Returns: string
      }
      _payroll_rules: { Args: { p_company: string }; Returns: Json }
      _payroll_set_status: {
        Args: { p_paid_on: string; p_payslip: string; p_status: string }
        Returns: string
      }
      _payroll_sheet_employees: {
        Args: { p_company: string; p_month: string }
        Returns: string[]
      }
      _payroll_stale: {
        Args: { p_pay: Json; p_payslip: string }
        Returns: Json
      }
      _payroll_suggested_rate: {
        Args: { p_rules: Json; p_salary: number }
        Returns: number
      }
      _payroll_tax_from_split: {
        Args: { p_allowances: number; p_basic: number; p_rules: Json }
        Returns: Json
      }
      _payroll_totals: {
        Args: {
          p_allowances: number
          p_basic: number
          p_lines: Json
          p_other: number
          p_other_deductions: number
          p_overtime: number
          p_tax: number
        }
        Returns: Json
      }
      _payroll_within: {
        Args: { p: Json; p_fallback: number; p_hi: number; p_lo: number }
        Returns: number
      }
      _payroll_working_dates: {
        Args: { p_employee: string; p_from: string; p_to: string }
        Returns: string[]
      }
      _payroll_yearly_tax: {
        Args: { p_income: number; p_slabs: Json }
        Returns: number
      }
      _people_asset_prefix: { Args: { p_category: string }; Returns: string }
      _people_auto_onboarding: {
        Args: { p_employee: string; p_start: string }
        Returns: string
      }
      _people_auto_state: {
        Args: { p_employee: string; p_key: string }
        Returns: boolean
      }
      _people_clean_field: {
        Args: { p_field: string; p_value: string }
        Returns: string
      }
      _people_code_prefix: { Args: { p_company: string }; Returns: string }
      _people_fill_codes: { Args: { p_company: string }; Returns: number }
      _people_insert_employee: {
        Args: { p_company: string; v: Json }
        Returns: {
          address: string | null
          avatar_url: string | null
          bank_account_number: string | null
          bank_name: string | null
          cnic: string | null
          company_id: string
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          education: string | null
          email: string | null
          emergency_contact: string | null
          employee_code: string | null
          father_name: string | null
          gender: string | null
          id: string
          joining_date: string | null
          must_change_password: boolean
          name: string
          notes: string | null
          password: string | null
          password_hash: string | null
          phone: string | null
          rank: string
          salary_divisor: number | null
          separation_date: string | null
          share_birthday: boolean
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
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _people_next_asset_tag: {
        Args: { p_category: string; p_company: string }
        Returns: string
      }
      _people_next_code: { Args: { p_company: string }; Returns: string }
      _people_pay_event: {
        Args: {
          p_company: string
          p_detail: string
          p_effective: string
          p_employee: string
          p_kind: string
          p_title: string
        }
        Returns: undefined
      }
      _people_request_fields: { Args: never; Returns: string[] }
      _people_seed_templates: {
        Args: { p_company: string }
        Returns: undefined
      }
      _people_validate_employee: {
        Args: {
          p_company: string
          p_create_departments?: boolean
          p_data: Json
          p_employee: string
        }
        Returns: Json
      }
      _platform_assert: { Args: { p_roles: string[] }; Returns: string }
      _platform_backup_assert: { Args: { p_scope: string }; Returns: string }
      _platform_backup_count: {
        Args: { p_company: string; p_scope: string; p_table: string }
        Returns: number
      }
      _platform_backup_tables: {
        Args: { p_scope: string }
        Returns: {
          excluded_columns: string[]
          pk_columns: string[]
          table_name: string
        }[]
      }
      _platform_has_cols: {
        Args: { p_cols: string[]; p_table: string }
        Returns: boolean
      }
      _platform_person: { Args: { p_user: string }; Returns: string }
      _platform_settings_json: { Args: { p_company: string }; Returns: Json }
      _platform_strip_money: { Args: { p: Json }; Returns: Json }
      _policies_actor_name: { Args: never; Returns: string }
      _policies_hr_company: { Args: never; Returns: string }
      _policies_norm_name: { Args: { p_name: string }; Returns: string }
      _policies_placeholders: { Args: { p_text: string }; Returns: string[] }
      _policies_publish_problem: { Args: { p_body: string }; Returns: string }
      _policies_request_ip: { Args: never; Returns: string }
      _portal_employee: {
        Args: { p_token: string }
        Returns: {
          address: string | null
          avatar_url: string | null
          bank_account_number: string | null
          bank_name: string | null
          cnic: string | null
          company_id: string
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          education: string | null
          email: string | null
          emergency_contact: string | null
          employee_code: string | null
          father_name: string | null
          gender: string | null
          id: string
          joining_date: string | null
          must_change_password: boolean
          name: string
          notes: string | null
          password: string | null
          password_hash: string | null
          phone: string | null
          rank: string
          salary_divisor: number | null
          separation_date: string | null
          share_birthday: boolean
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
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _portal_log: {
        Args: {
          p_action: string
          p_description: string
          p_details?: Json
          p_employee: Database["public"]["Tables"]["employees"]["Row"]
        }
        Returns: undefined
      }
      _portal_resolve_session: { Args: { p_token: string }; Returns: Json }
      _portal_throttled: {
        Args: {
          p_action: string
          p_employee: string
          p_limit: number
          p_window: string
        }
        Returns: boolean
      }
      _push_b64u: { Args: { p: string }; Returns: string }
      _push_config: { Args: never; Returns: Json }
      _push_devices_json: {
        Args: { p_employee: string; p_user: string }
        Returns: Json
      }
      _push_save: {
        Args: {
          p_company: string
          p_device: string
          p_employee: string
          p_subscription: Json
          p_user: string
        }
        Returns: Json
      }
      _push_store_vapid: {
        Args: { p_private: Json; p_public: string }
        Returns: string
      }
      _time_auto_present: {
        Args: {
          p_company: string
          p_date: string
          p_employee: string
          p_source?: string
        }
        Returns: boolean
      }
      _time_cfg: {
        Args: { p_company: string }
        Returns: {
          auto_present: boolean
          company_id: string
          created_at: string
          evening_start: string
          grace_minutes: number
          hours_per_day: number
          hours_threshold_pct: number
          locked_through: string | null
          morning_start: string
          night_start: string
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _time_check_correction: {
        Args: { p_in: string; p_kind: string; p_out: string }
        Returns: Record<string, unknown>
      }
      _time_day_punches: {
        Args: {
          p_company: string
          p_employee?: string
          p_from: string
          p_to: string
        }
        Returns: {
          corrected: boolean
          employee_id: string
          first_in: string
          last_out: string
          punches: number
          work_date: string
        }[]
      }
      _time_days: {
        Args: {
          p_company: string
          p_department?: string
          p_employee?: string
          p_from: string
          p_to: string
        }
        Returns: {
          corrected: boolean
          early_minutes: number
          employee_id: string
          first_in: string
          half: boolean
          kind: string
          last_out: string
          late_minutes: number
          punches: number
          register: string
          register_source: string
          shift_end: string
          shift_start: string
          target_minutes: number
          work_date: string
          worked_minutes: number
          working: boolean
        }[]
      }
      _time_employee_month: {
        Args: { p_company: string; p_employee: string; p_month: string }
        Returns: Json
      }
      _time_hours: {
        Args: {
          p_company: string
          p_department?: string
          p_employee?: string
          p_month: string
        }
        Returns: {
          absent_days: number
          early_days: number
          early_minutes: number
          employee_id: string
          late_days: number
          late_minutes: number
          leave_days: number
          measured_days: number
          no_out_days: number
          offday_minutes: number
          pct: number
          short_minutes: number
          target_minutes: number
          through: string
          unmeasured_days: number
          worked_minutes: number
          working_days: number
        }[]
      }
      _time_kind_label: { Args: { p_kind: string }; Returns: string }
      _time_locked: {
        Args: { p_company: string; p_date: string; p_employee: string }
        Returns: boolean
      }
      _time_log: {
        Args: {
          p_action: string
          p_company: string
          p_description: string
          p_details: Json
          p_employee: string
        }
        Returns: undefined
      }
      _time_new_device_key: {
        Args: { p_company: string; p_device: string }
        Returns: string
      }
      _time_on_leave: {
        Args: { p_date: string; p_employee: string }
        Returns: boolean
      }
      _time_parse_ts: { Args: { p_ts: string; p_tz: string }; Returns: string }
      _time_settings: {
        Args: { p_company: string }
        Returns: {
          auto_present: boolean
          company_id: string
          created_at: string
          evening_start: string
          grace_minutes: number
          hours_per_day: number
          hours_threshold_pct: number
          locked_through: string | null
          morning_start: string
          night_start: string
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "time_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _time_shift_start: {
        Args: {
          p_cfg: Database["public"]["Tables"]["time_settings"]["Row"]
          p_shift: string
        }
        Returns: string
      }
      _time_today: { Args: { p_company: string }; Returns: string }
      _time_tz: { Args: { p_company: string }; Returns: string }
      _time_work_date: {
        Args: { p_at: string; p_company: string; p_employee: string }
        Returns: string
      }
      activity_area: { Args: { p_action: string }; Returns: string }
      auth_company_id: { Args: never; Returns: string }
      auth_is_finance: { Args: never; Returns: boolean }
      auth_is_hr: { Args: never; Returns: boolean }
      auth_is_owner: { Args: never; Returns: boolean }
      auth_is_staff: { Args: never; Returns: boolean }
      auth_mfa_ok: { Args: never; Returns: boolean }
      auth_role: { Args: never; Returns: string }
      careers_add_note: {
        Args: { p_application: string; p_body: string }
        Returns: string
      }
      careers_application_precheck: {
        Args: { p_email: string; p_ip_hash: string; p_job: string }
        Returns: Json
      }
      careers_delete_application: { Args: { p_id: string }; Returns: string }
      careers_delete_job: { Args: { p_id: string }; Returns: undefined }
      careers_delete_note: { Args: { p_note: string }; Returns: undefined }
      careers_hire_application: {
        Args: {
          p_cnic?: string
          p_department?: string
          p_id: string
          p_joining_date: string
          p_rank: string
        }
        Returns: string
      }
      careers_public_company: { Args: { p_slug: string }; Returns: Json }
      careers_public_job: {
        Args: { p_company_slug: string; p_job_slug: string }
        Returns: Json
      }
      careers_rate_application: {
        Args: { p_id: string; p_rating: number }
        Returns: undefined
      }
      careers_save_job: {
        Args: {
          p_closes_on: string
          p_department: string
          p_description: string
          p_employment_type: string
          p_id: string
          p_location: string
          p_openings: number
          p_requirements: string
          p_slug: string
          p_status: string
          p_summary: string
          p_title: string
          p_workplace: string
        }
        Returns: Json
      }
      careers_set_application_status: {
        Args: { p_ids: string[]; p_note?: string; p_status: string }
        Returns: number
      }
      careers_set_company_slug: { Args: { p_slug: string }; Returns: string }
      careers_set_job_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      careers_slugify: { Args: { p_text: string }; Returns: string }
      careers_submit_application: {
        Args: {
          p_cover_letter: string
          p_cv_name: string
          p_cv_path: string
          p_cv_size: number
          p_email: string
          p_ip_hash: string
          p_job: string
          p_link: string
          p_name: string
          p_phone: string
        }
        Returns: Json
      }
      company_today: { Args: { p_company: string }; Returns: string }
      company_week: {
        Args: { p_company: string }
        Returns: {
          saturday_off_from: string
          saturday_off_until: string
          saturday_policy: string
          sunday_off: boolean
        }[]
      }
      create_company_for_current_user: {
        Args: {
          p_address?: string
          p_company_size?: string
          p_company_type?: string
          p_currency?: string
          p_logo?: string
          p_name: string
          p_phone?: string
          p_website?: string
        }
        Returns: string
      }
      current_salary: { Args: { employee: string }; Returns: number }
      employee_login: {
        Args: { p_cnic: string; p_password: string }
        Returns: Json
      }
      engagement_announcements: { Args: never; Returns: Json }
      engagement_celebrations: { Args: { p_days?: number }; Returns: Json }
      engagement_coming_up: { Args: never; Returns: Json }
      engagement_complaints: { Args: never; Returns: Json }
      engagement_create_poll: {
        Args: {
          p_description: string
          p_expires_at?: string
          p_options: string[]
          p_question: string
        }
        Returns: string
      }
      engagement_delete_announcement: {
        Args: { p_id: string }
        Returns: undefined
      }
      engagement_delete_poll: { Args: { p_id: string }; Returns: undefined }
      engagement_mark_thread_read: {
        Args: { p_employee: string }
        Returns: number
      }
      engagement_message_directory: { Args: never; Returns: Json }
      engagement_poll_detail: { Args: { p_id: string }; Returns: Json }
      engagement_polls: { Args: never; Returns: Json }
      engagement_respond_complaint: {
        Args: { p_id: string; p_response: string; p_status: string }
        Returns: undefined
      }
      engagement_save_announcement: {
        Args: {
          p_audience?: string
          p_content: string
          p_department?: string
          p_id: string
          p_pinned?: boolean
          p_title: string
        }
        Returns: string
      }
      engagement_send_message: {
        Args: { p_content: string; p_employee: string }
        Returns: Json
      }
      engagement_send_morning_greetings: { Args: never; Returns: number }
      engagement_send_wish: {
        Args: { p_employee: string; p_kind: string; p_message?: string }
        Returns: Json
      }
      engagement_set_announcement_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      engagement_set_poll_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      engagement_thread: {
        Args: { p_employee: string; p_limit?: number }
        Returns: Json
      }
      engagement_threads: { Args: never; Returns: Json }
      expense_complete_course: {
        Args: { p_certificate?: Json; p_id: string; p_outcome: string }
        Returns: undefined
      }
      expense_delete: { Args: { p_id: string }; Returns: string[] }
      expense_end_subscription: {
        Args: { p_id: string; p_on: string }
        Returns: undefined
      }
      expense_finance_add: {
        Args: {
          p_employee: string
          p_input: Json
          p_payment?: Json
          p_quote?: Json
          p_receipt?: Json
          p_tell?: boolean
        }
        Returns: string
      }
      expense_finance_decline: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      expense_finance_reconsider: { Args: { p_id: string }; Returns: undefined }
      expense_hr_decide: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: undefined
      }
      expense_hr_undo: { Args: { p_id: string }; Returns: undefined }
      expense_record_payment: {
        Args: { p_id: string; p_payment: Json; p_receipt?: Json }
        Returns: string
      }
      expense_undo_payment: { Args: { p_id: string }; Returns: string[] }
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
          role: string | null
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
      is_saturday_off: {
        Args: {
          p_date: string
          p_from: string
          p_policy: string
          p_until: string
        }
        Returns: boolean
      }
      is_working_day: {
        Args: { p_company: string; p_date: string }
        Returns: boolean
      }
      leave_badge_counts: { Args: never; Returns: Json }
      leave_balances: {
        Args: { p_employee?: string; p_year: number }
        Returns: {
          allowed: number
          avatar_url: string
          custom: boolean
          default_days: number
          department: string
          employee_code: string
          employee_id: string
          employee_name: string
          is_paid: boolean
          leave_type_id: string
          pending: number
          remaining: number
          type_kind: string
          type_name: string
          unlimited: boolean
          used: number
        }[]
      }
      leave_count_days: {
        Args: { p_employee: string; p_end: string; p_start: string }
        Returns: number
      }
      leave_request_cancel: { Args: { p_id: string }; Returns: Json }
      leave_request_create: {
        Args: {
          p_approve_now?: boolean
          p_employee: string
          p_end: string
          p_leave_type: string
          p_reason?: string
          p_start: string
        }
        Returns: Json
      }
      leave_request_review: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: Json
      }
      leave_request_undo: { Args: { p_id: string }; Returns: Json }
      leave_requests_list: {
        Args: {
          p_employee?: string
          p_from?: string
          p_status?: string
          p_to?: string
          p_year?: number
        }
        Returns: {
          avatar_url: string
          created_at: string
          days_count: number
          department: string
          employee_code: string
          employee_id: string
          employee_name: string
          end_date: string
          id: string
          is_paid: boolean
          leave_type_id: string
          locked: boolean
          reason: string
          requested_via: string
          requester_name: string
          review_notes: string
          reviewed_at: string
          reviewer_name: string
          start_date: string
          status: string
          type_kind: string
          type_name: string
        }[]
      }
      leave_set_allocation: {
        Args: {
          p_days: number
          p_employee: string
          p_leave_type: string
          p_year: number
        }
        Returns: undefined
      }
      leave_settings_save: {
        Args: { p_requires_approval: boolean }
        Returns: undefined
      }
      leave_type_save: {
        Args: {
          p_days_per_year: number
          p_id: string
          p_is_paid: boolean
          p_kind: string
          p_name: string
        }
        Returns: string
      }
      leave_type_set_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      leave_types_seed_defaults: { Args: never; Returns: number }
      letter_default_reply_by: { Args: { p_days?: number }; Returns: string }
      letter_issue: {
        Args: {
          p_body: string
          p_employee: string
          p_facts?: Json
          p_kind: string
          p_period?: string
          p_reply_by?: string
          p_signatory_name?: string
          p_signatory_title?: string
          p_subject: string
        }
        Returns: Json
      }
      letter_settings_get: { Args: never; Returns: Json }
      letter_settings_save: {
        Args: {
          p_ref_prefix: string
          p_signatory_name: string
          p_signatory_title: string
        }
        Returns: undefined
      }
      letter_withdraw: {
        Args: { p_letter: string; p_reason: string }
        Returns: undefined
      }
      log_activity: {
        Args: {
          p_action: string
          p_description: string
          p_details?: Json
          p_employee?: string
        }
        Returns: string
      }
      notify_employee: {
        Args: {
          p_body?: string
          p_company: string
          p_employee: string
          p_href?: string
          p_kind: string
          p_title: string
        }
        Returns: string
      }
      notify_roles: {
        Args: {
          p_body?: string
          p_company: string
          p_href?: string
          p_kind: string
          p_roles: string[]
          p_title: string
        }
        Returns: number
      }
      notify_user: {
        Args: {
          p_body?: string
          p_company: string
          p_href?: string
          p_kind: string
          p_title: string
          p_user: string
        }
        Returns: string
      }
      overtime_add: {
        Args: {
          p_approve_now?: boolean
          p_date: string
          p_employee: string
          p_hours: number
          p_reason?: string
          p_type: string
        }
        Returns: Json
      }
      overtime_hours_list: {
        Args: {
          p_employee?: string
          p_from: string
          p_status?: string
          p_to: string
        }
        Returns: {
          avatar_url: string
          claimed_hours: number
          created_at: string
          date: string
          department: string
          employee_code: string
          employee_id: string
          employee_name: string
          hours: number
          id: string
          locked: boolean
          overtime_type: string
          pay_stage: string
          payslip_month: string
          reason: string
          requested_via: string
          requester_name: string
          review_notes: string
          reviewed_at: string
          reviewer_name: string
          status: string
        }[]
      }
      overtime_remove: { Args: { p_id: string }; Returns: undefined }
      overtime_review: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: Json
      }
      overtime_set_hours: {
        Args: { p_hours: number; p_id: string }
        Returns: Json
      }
      payroll_apply: {
        Args: {
          p_employee_ids?: string[]
          p_month: string
          p_op: string
          p_paid_on?: string
        }
        Returns: Json
      }
      payroll_counts: { Args: never; Returns: Json }
      payroll_overtime: {
        Args: { p_month?: string; p_scope?: string }
        Returns: Json
      }
      payroll_pay_events: {
        Args: { p_limit?: number; p_open?: boolean }
        Returns: Json
      }
      payroll_payslip: { Args: { p_id: string }; Returns: Json }
      payroll_payslip_action: {
        Args: { p_id: string; p_op: string; p_paid_on?: string }
        Returns: Json
      }
      payroll_price_overtime: {
        Args: {
          p_amount?: number
          p_id: string
          p_kind: string
          p_multiplier?: number
          p_rate?: number
        }
        Returns: Json
      }
      payroll_price_waiting: { Args: never; Returns: Json }
      payroll_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      payroll_rules: { Args: never; Returns: Json }
      payroll_salary_overview: { Args: never; Returns: Json }
      payroll_save_rules: { Args: { p_rules: Json }; Returns: Json }
      payroll_save_salaries: {
        Args: { p_effective_month: string; p_reason?: string; p_rows: Json }
        Returns: Json
      }
      payroll_set_pay_events_done: {
        Args: { p_done?: boolean; p_ids?: string[] }
        Returns: number
      }
      payroll_sheet: { Args: { p_month: string }; Returns: Json }
      payroll_take_back_salary: { Args: { p_id: string }; Returns: Json }
      payroll_update_payslip: {
        Args: { p_id: string; p_input: Json }
        Returns: Json
      }
      people_assign_asset: {
        Args: {
          p_asset: string
          p_condition?: string
          p_date?: string
          p_employee: string
          p_note?: string
        }
        Returns: Json
      }
      people_assign_missing_codes: { Args: never; Returns: number }
      people_badge_counts: { Args: never; Returns: Json }
      people_bulk_set_department: {
        Args: { p_department: string; p_employees: string[] }
        Returns: number
      }
      people_delete_department: {
        Args: { p_department: string; p_move_to?: string }
        Returns: number
      }
      people_ensure_checklist_templates: { Args: never; Returns: number }
      people_import_employees: {
        Args: { p_rows: Json; p_start_onboarding?: boolean }
        Returns: Json
      }
      people_next_asset_tag: { Args: { p_category: string }; Returns: string }
      people_portal_access: { Args: { p_employee: string }; Returns: Json }
      people_rejoin_employee: {
        Args: { p_date?: string; p_employee: string }
        Returns: Json
      }
      people_return_asset: {
        Args: {
          p_asset: string
          p_condition?: string
          p_date?: string
          p_next_status?: string
          p_note?: string
        }
        Returns: Json
      }
      people_review_update_request: {
        Args: { p_approved: string[]; p_note?: string; p_request: string }
        Returns: Json
      }
      people_revoke_portal_sessions: {
        Args: { p_employee: string }
        Returns: number
      }
      people_salary_set: {
        Args: { p_employees: string[] }
        Returns: {
          employee_id: string
          salary_set: boolean
        }[]
      }
      people_save_employee: {
        Args: { p_data: Json; p_employee: string }
        Returns: Json
      }
      people_separate_employee: {
        Args: { p_employee: string; p_last_day: string; p_reason?: string }
        Returns: Json
      }
      people_set_checklist_item: {
        Args: { p_done: boolean; p_item: string }
        Returns: Json
      }
      people_set_checklist_status: {
        Args: { p_checklist: string; p_status: string }
        Returns: undefined
      }
      people_start_checklist: {
        Args: {
          p_due?: string
          p_employee: string
          p_kind: string
          p_note?: string
          p_notify?: boolean
          p_start?: string
          p_template?: string
        }
        Returns: string
      }
      people_sync_checklists: {
        Args: { p_checklist?: string }
        Returns: number
      }
      platform_access_summary: { Args: never; Returns: Json }
      platform_activity_facets: { Args: never; Returns: Json }
      platform_activity_feed: {
        Args: {
          p_actor?: string
          p_area?: string
          p_before?: string
          p_employee?: string
          p_from?: string
          p_limit?: number
          p_search?: string
          p_to?: string
        }
        Returns: Json
      }
      platform_backup_start: { Args: { p_scope: string }; Returns: Json }
      platform_backup_table: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_scope: string
          p_table: string
        }
        Returns: Json
      }
      platform_dashboard: { Args: { p_date?: string }; Returns: Json }
      platform_data_overview: { Args: never; Returns: Json }
      platform_get_settings: { Args: never; Returns: Json }
      platform_report_attendance: { Args: { p_month?: string }; Returns: Json }
      platform_report_headcount: { Args: { p_month?: string }; Returns: Json }
      platform_report_leave: { Args: { p_year?: number }; Returns: Json }
      platform_report_overtime: { Args: { p_month?: string }; Returns: Json }
      platform_update_company: { Args: { p_patch: Json }; Returns: Json }
      platform_update_settings: { Args: { p_patch: Json }; Returns: Json }
      policies_list: { Args: { p_archived?: boolean }; Returns: Json }
      policies_unsigned_count: { Args: never; Returns: number }
      policy_create: {
        Args: {
          p_body?: string
          p_requires_signature?: boolean
          p_summary?: string
          p_title: string
        }
        Returns: string
      }
      policy_discard_draft: { Args: { p_policy: string }; Returns: boolean }
      policy_publish: { Args: { p_policy: string }; Returns: Json }
      policy_remind_unsigned: { Args: { p_version: string }; Returns: number }
      policy_save_draft: {
        Args: { p_body: string; p_change_note?: string; p_policy: string }
        Returns: Json
      }
      policy_set_archived: {
        Args: { p_archived: boolean; p_policy: string }
        Returns: undefined
      }
      policy_signers: { Args: { p_version: string }; Returns: Json }
      policy_update_info: {
        Args: {
          p_policy: string
          p_requires_signature: boolean
          p_summary: string
          p_title: string
        }
        Returns: undefined
      }
      portal_acknowledge_letter: {
        Args: { p_letter: string; p_token: string }
        Returns: Json
      }
      portal_add_document: {
        Args: {
          p_file_name?: string
          p_mime?: string
          p_name: string
          p_path: string
          p_size?: number
          p_token: string
          p_type: string
        }
        Returns: Json
      }
      portal_announcements: { Args: { p_token: string }; Returns: Json }
      portal_careers_openings: { Args: { p_token: string }; Returns: Json }
      portal_celebrations: {
        Args: { p_days?: number; p_token: string }
        Returns: Json
      }
      portal_change_password: {
        Args: { p_new: string; p_old: string; p_token: string }
        Returns: Json
      }
      portal_clear_notifications: {
        Args: { p_ids?: string[]; p_token: string }
        Returns: number
      }
      portal_company_settings: { Args: { p_token: string }; Returns: Json }
      portal_complaints: { Args: { p_token: string }; Returns: Json }
      portal_engagement_counts: { Args: { p_token: string }; Returns: Json }
      portal_expected_pay: {
        Args: { p_month?: string; p_token: string }
        Returns: Json
      }
      portal_expense: { Args: { p_id: string; p_token: string }; Returns: Json }
      portal_expense_complete: {
        Args: {
          p_certificate?: Json
          p_id: string
          p_outcome: string
          p_token: string
        }
        Returns: undefined
      }
      portal_expense_request: {
        Args: { p_input: Json; p_quote?: Json; p_token: string }
        Returns: string
      }
      portal_expense_withdraw: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      portal_expenses: { Args: { p_token: string }; Returns: Json }
      portal_home: {
        Args: { p_today?: string; p_token: string }
        Returns: Json
      }
      portal_leave_cancel: {
        Args: { p_id: string; p_token: string }
        Returns: Json
      }
      portal_leave_count_days: {
        Args: { p_end: string; p_start: string; p_token: string }
        Returns: number
      }
      portal_leave_overview: {
        Args: { p_token: string; p_year?: number }
        Returns: Json
      }
      portal_leave_request: {
        Args: {
          p_end: string
          p_leave_type: string
          p_reason?: string
          p_start: string
          p_token: string
        }
        Returns: Json
      }
      portal_letter: {
        Args: { p_letter: string; p_token: string }
        Returns: Json
      }
      portal_letters: { Args: { p_token: string }; Returns: Json }
      portal_logout: { Args: { p_token: string }; Returns: Json }
      portal_mark_notifications_read: {
        Args: { p_ids?: string[]; p_token: string }
        Returns: number
      }
      portal_me: { Args: { p_token: string }; Returns: Json }
      portal_messages: {
        Args: { p_limit?: number; p_token: string }
        Returns: Json
      }
      portal_my_assets: { Args: { p_token: string }; Returns: Json }
      portal_my_attendance: {
        Args: { p_month?: string; p_token: string }
        Returns: Json
      }
      portal_my_corrections: { Args: { p_token: string }; Returns: Json }
      portal_my_documents: { Args: { p_token: string }; Returns: Json }
      portal_my_hours: {
        Args: { p_month?: string; p_token: string }
        Returns: Json
      }
      portal_notifications: { Args: { p_token: string }; Returns: Json }
      portal_overtime_claim: {
        Args: {
          p_date: string
          p_hours: number
          p_reason?: string
          p_token: string
          p_type: string
        }
        Returns: Json
      }
      portal_overtime_overview: {
        Args: { p_month?: string; p_token: string }
        Returns: Json
      }
      portal_overtime_withdraw: {
        Args: { p_id: string; p_token: string }
        Returns: Json
      }
      portal_payslip: { Args: { p_id: string; p_token: string }; Returns: Json }
      portal_payslips: { Args: { p_token: string }; Returns: Json }
      portal_pending_signatures: { Args: { p_token: string }; Returns: Json }
      portal_policies: { Args: { p_token: string }; Returns: Json }
      portal_policy_signature: {
        Args: { p_signature: string; p_token: string }
        Returns: Json
      }
      portal_policy_version: {
        Args: { p_token: string; p_version: string }
        Returns: Json
      }
      portal_polls: { Args: { p_token: string }; Returns: Json }
      portal_profile_requests: { Args: { p_token: string }; Returns: Json }
      portal_push_devices: { Args: { p_token: string }; Returns: Json }
      portal_push_remove_device: {
        Args: { p_id: string; p_token: string }
        Returns: Json
      }
      portal_push_subscribe: {
        Args: {
          p_device?: string
          p_subscription: Json
          p_token: string
          p_welcome?: boolean
        }
        Returns: Json
      }
      portal_push_test: { Args: { p_token: string }; Returns: Json }
      portal_push_unsubscribe: {
        Args: { p_endpoint: string; p_token: string }
        Returns: Json
      }
      portal_remove_avatar: { Args: { p_token: string }; Returns: Json }
      portal_reply_letter: {
        Args: { p_letter: string; p_reply: string; p_token: string }
        Returns: Json
      }
      portal_request_correction: {
        Args: {
          p_date: string
          p_kind: string
          p_reason?: string
          p_time_in?: string
          p_time_out?: string
          p_token: string
        }
        Returns: Json
      }
      portal_request_profile_update: {
        Args: { p_changes: Json; p_token: string }
        Returns: Json
      }
      portal_send_message: {
        Args: { p_content: string; p_token: string }
        Returns: Json
      }
      portal_send_wish: {
        Args: {
          p_employee: string
          p_kind: string
          p_message?: string
          p_token: string
        }
        Returns: Json
      }
      portal_sessions: { Args: { p_token: string }; Returns: Json }
      portal_set_share_birthday: {
        Args: { p_share: boolean; p_token: string }
        Returns: Json
      }
      portal_sign_out_other_devices: {
        Args: { p_token: string }
        Returns: Json
      }
      portal_sign_policy: {
        Args: {
          p_agreed: boolean
          p_signature_png: string
          p_token: string
          p_typed_name: string
          p_user_agent?: string
          p_version: string
        }
        Returns: Json
      }
      portal_submit_complaint: {
        Args: {
          p_anonymous?: boolean
          p_description: string
          p_subject: string
          p_token: string
        }
        Returns: Json
      }
      portal_unseen_payslips: { Args: { p_token: string }; Returns: number }
      portal_update_avatar: {
        Args: { p_path: string; p_token: string; p_url: string }
        Returns: Json
      }
      portal_vote: {
        Args: { p_option: string; p_poll: string; p_token: string }
        Returns: Json
      }
      portal_withdraw_correction: {
        Args: { p_id: string; p_token: string }
        Returns: Json
      }
      portal_withdraw_profile_request: {
        Args: { p_id: string; p_token: string }
        Returns: Json
      }
      process_update_request: {
        Args: { p_req_id: string; p_status: string }
        Returns: Json
      }
      push_devices: { Args: never; Returns: Json }
      push_public_key: { Args: never; Returns: string }
      push_remove_device: { Args: { p_id: string }; Returns: Json }
      push_subscribe: {
        Args: { p_device?: string; p_subscription: Json; p_welcome?: boolean }
        Returns: Json
      }
      push_test: { Args: never; Returns: Json }
      push_unsubscribe: { Args: { p_endpoint: string }; Returns: Json }
      submit_update_request: {
        Args: { p_changes: Json; p_emp_id: string }
        Returns: Json
      }
      time_add_standard_holidays: {
        Args: { p_country?: string; p_year: number }
        Returns: number
      }
      time_daily_summary: { Args: { p_date: string }; Returns: Json }
      time_day_log: {
        Args: {
          p_department?: string
          p_employee?: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      time_day_punches: {
        Args: { p_date: string; p_employee: string }
        Returns: Json
      }
      time_delete_device: { Args: { p_id: string }; Returns: undefined }
      time_delete_event: { Args: { p_id: string }; Returns: undefined }
      time_employee_month: {
        Args: { p_employee: string; p_month: string }
        Returns: Json
      }
      time_fill_from_punches: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      time_get_settings: { Args: never; Returns: Json }
      time_hours_report: {
        Args: { p_department?: string; p_month: string }
        Returns: Json
      }
      time_ingest_punches: {
        Args: { p_device?: Json; p_device_key: string; p_punches?: Json }
        Returns: Json
      }
      time_link_terminal: {
        Args: { p_device_user_id: string; p_employee: string }
        Returns: number
      }
      time_mark_all_present: {
        Args: { p_date: string; p_employee_ids?: string[] }
        Returns: number
      }
      time_mark_attendance: { Args: { p_changes: Json }; Returns: Json }
      time_month_register: {
        Args: { p_department?: string; p_month: string }
        Returns: Json
      }
      time_review_correction: {
        Args: {
          p_decision: string
          p_id: string
          p_note?: string
          p_time_in?: string
          p_time_out?: string
        }
        Returns: Json
      }
      time_rotate_device_key: { Args: { p_id: string }; Returns: string }
      time_save_device: {
        Args: {
          p_active?: boolean
          p_direction?: string
          p_id: string
          p_location?: string
          p_name: string
          p_serial?: string
        }
        Returns: Json
      }
      time_save_event: {
        Args: {
          p_affects?: boolean
          p_date: string
          p_description?: string
          p_end_date?: string
          p_id: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      time_save_settings: { Args: { p_settings: Json }; Returns: Json }
      time_set_lock: { Args: { p_month: string }; Returns: string }
      time_terminal_ids: { Args: never; Returns: Json }
      time_unlink_terminal: {
        Args: { p_device_user_id: string }
        Returns: undefined
      }
      update_employee_avatar: {
        Args: { p_avatar_url: string; p_emp_id: string }
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
      working_dates: {
        Args: {
          p_company: string
          p_employee?: string
          p_from: string
          p_to: string
        }
        Returns: string[]
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
        | "casual"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "casual",
      ],
    },
  },
} as const
