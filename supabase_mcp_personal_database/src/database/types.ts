export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          username: string | null
          full_name: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          username?: string | null
          full_name?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          username?: string | null
          full_name?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      personal_data: {
        Row: {
          id: string
          user_id: string
          data_type: string
          title: string | null
          content: Json
          tags: string[] | null
          classification: string
          is_encrypted: boolean
          created_at: string
          updated_at: string
          last_accessed: string
        }
        Insert: {
          id?: string
          user_id: string
          data_type: string
          title?: string | null
          content: Json
          tags?: string[] | null
          classification?: string
          is_encrypted?: boolean
          created_at?: string
          updated_at?: string
          last_accessed?: string
        }
        Update: {
          id?: string
          user_id?: string
          data_type?: string
          title?: string | null
          content?: Json
          tags?: string[] | null
          classification?: string
          is_encrypted?: boolean
          created_at?: string
          updated_at?: string
          last_accessed?: string
        }
      }
      data_field_definitions: {
        Row: {
          id: string
          field_name: string
          data_type: string
          validation_rules: Json
          is_required: boolean
          default_value: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          field_name: string
          data_type: string
          validation_rules?: Json
          is_required?: boolean
          default_value?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          field_name?: string
          data_type?: string
          validation_rules?: Json
          is_required?: boolean
          default_value?: Json | null
          created_at?: string
        }
      }
      data_access_log: {
        Row: {
          id: string
          user_id: string
          operation: string
          table_name: string
          record_id: string | null
          changes: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          operation: string
          table_name: string
          record_id?: string | null
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          operation?: string
          table_name?: string
          record_id?: string | null
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
} 