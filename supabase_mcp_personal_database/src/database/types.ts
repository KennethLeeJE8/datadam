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
          deleted_at: string | null
          created_at: string
          updated_at: string
          last_accessed: string
          category: string | null
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
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          last_accessed?: string
          category?: string | null
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
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          last_accessed?: string
          category?: string | null
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
      error_logs: {
        Row: {
          id: string
          level: string
          message: string
          category: string | null
          context: Json | null
          error_details: Json | null
          timestamp: string
          hostname: string | null
          process_id: number | null
          correlation_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          level: string
          message: string
          category?: string | null
          context?: Json | null
          error_details?: Json | null
          timestamp?: string
          hostname?: string | null
          process_id?: number | null
          correlation_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          level?: string
          message?: string
          category?: string | null
          context?: Json | null
          error_details?: Json | null
          timestamp?: string
          hostname?: string | null
          process_id?: number | null
          correlation_id?: string | null
          created_at?: string
        }
      }
      error_alerts: {
        Row: {
          id: string
          level: string
          message: string
          context: Json | null
          timestamp: string
          correlation_id: string | null
          status: string
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          level: string
          message: string
          context?: Json | null
          timestamp: string
          correlation_id?: string | null
          status?: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          level?: string
          message?: string
          context?: Json | null
          timestamp?: string
          correlation_id?: string | null
          status?: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
        }
      }
      error_metrics: {
        Row: {
          id: string
          metric_type: string
          metric_name: string
          metric_value: number
          labels: Json | null
          timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          metric_type: string
          metric_name: string
          metric_value: number
          labels?: Json | null
          timestamp: string
          created_at?: string
        }
        Update: {
          id?: string
          metric_type?: string
          metric_name?: string
          metric_value?: number
          labels?: Json | null
          timestamp?: string
          created_at?: string
        }
      }
      error_recovery_attempts: {
        Row: {
          id: string
          error_correlation_id: string
          recovery_strategy: string
          attempt_number: number
          status: string
          duration_ms: number | null
          error_details: Json | null
          recovery_context: Json | null
          started_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          error_correlation_id: string
          recovery_strategy: string
          attempt_number: number
          status: string
          duration_ms?: number | null
          error_details?: Json | null
          recovery_context?: Json | null
          started_at: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          error_correlation_id?: string
          recovery_strategy?: string
          attempt_number?: number
          status?: string
          duration_ms?: number | null
          error_details?: Json | null
          recovery_context?: Json | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
      }
      category_registry: {
        Row: {
          id: string
          category_name: string
          display_name: string
          description: string | null
          is_active: boolean
          item_count: number
          first_activation: string | null
          last_modified: string
          trigger_words: string[]
          query_hint: string | null
          example_queries: string[]
          min_items_for_activation: number
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          category_name: string
          display_name: string
          description?: string | null
          is_active?: boolean
          item_count?: number
          first_activation?: string | null
          last_modified?: string
          trigger_words?: string[]
          query_hint?: string | null
          example_queries?: string[]
          min_items_for_activation?: number
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          category_name?: string
          display_name?: string
          description?: string | null
          is_active?: boolean
          item_count?: number
          first_activation?: string | null
          last_modified?: string
          trigger_words?: string[]
          query_hint?: string | null
          example_queries?: string[]
          min_items_for_activation?: number
          metadata?: Json
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_personal_data: {
        Args: {
          user_id: string
          search_text: string
          data_types?: string[]
          tags?: string[]
          classification?: string
          limit?: number
          offset?: number
        }
        Returns: {
          id: string
          user_id: string
          data_type: string
          title: string
          content: Json
          tags: string[]
          classification: string
          created_at: string
        }[]
      }
      bulk_update_personal_data_tags: {
        Args: {
          user_id: string
          record_ids: string[]
          tags_to_add: string[]
          tags_to_remove: string[]
        }
        Returns: {
          updated_count: number
        }
      }
      soft_delete_personal_data: {
        Args: {
          user_id: string
          record_id: string
          deletion_reason: string
        }
        Returns: {
          success: boolean
          soft_deleted_id: string
          deletion_timestamp: string
        }
      }
      hard_delete_user_data: {
        Args: {
          user_id: string
          confirmation_token: string
        }
        Returns: {
          success: boolean
          deleted_records: number
          deletion_timestamp: string
          gdpr_compliant: boolean
        }
      }
      export_user_data: {
        Args: {
          user_id: string
        }
        Returns: {
          personal_data: Json[]
          profiles: Json[]
          data_access_log: Json[]
          export_timestamp: string
          total_records: number
        }
      }
      get_data_type_stats: {
        Args: Record<string, never>
        Returns: {
          total_records: number
          data_types: Json
          classifications: Json
        }
      }
      get_error_stats: {
        Args: {
          time_window: string
        }
        Returns: {
          total_errors: number
          error_rate: number
          errors_by_level: Json
          errors_by_category: Json
        }
      }
      auto_resolve_alerts: {
        Args: Record<string, never>
        Returns: {
          resolved_count: number
        }
      }
      cleanup_old_error_logs: {
        Args: {
          retention_days: number
        }
        Returns: {
          deleted_count: number
        }
      }
      get_active_categories: {
        Args: Record<string, never>
        Returns: {
          category_name: string
          display_name: string
          description: string
          item_count: number
          trigger_words: string[]
          query_hint: string
          example_queries: string[]
          last_modified: string
        }[]
      }
      get_category_stats: {
        Args: Record<string, never>
        Returns: {
          total_categories: number
          active_categories: number
          total_items: number
          categories_json: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
} 