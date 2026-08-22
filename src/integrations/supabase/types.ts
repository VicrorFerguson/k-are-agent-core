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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      kare_agent_health: {
        Row: {
          agent_id: string
          health: string
          id: number
          observed_at: string
        }
        Insert: {
          agent_id: string
          health: string
          id?: number
          observed_at?: string
        }
        Update: {
          agent_id?: string
          health?: string
          id?: number
          observed_at?: string
        }
        Relationships: []
      }
      kare_agents: {
        Row: {
          agent_id: string
          capabilities: Json
          config_revision: number
          config_version: string
          credential_ref: string | null
          display_name: string
          enabled: boolean
          endpoint_ref: string | null
          is_mock: boolean
          kind: string
          policy_ref: string
          registered_at: string
          required_scopes: Json
        }
        Insert: {
          agent_id: string
          capabilities?: Json
          config_revision: number
          config_version: string
          credential_ref?: string | null
          display_name: string
          enabled: boolean
          endpoint_ref?: string | null
          is_mock: boolean
          kind: string
          policy_ref: string
          registered_at?: string
          required_scopes?: Json
        }
        Update: {
          agent_id?: string
          capabilities?: Json
          config_revision?: number
          config_version?: string
          credential_ref?: string | null
          display_name?: string
          enabled?: boolean
          endpoint_ref?: string | null
          is_mock?: boolean
          kind?: string
          policy_ref?: string
          registered_at?: string
          required_scopes?: Json
        }
        Relationships: []
      }
      kare_audit_events: {
        Row: {
          action: string
          actor_id: string
          at: string
          audit_id: string
          metadata: Json
          outcome: string
          subject: string
        }
        Insert: {
          action: string
          actor_id: string
          at: string
          audit_id: string
          metadata?: Json
          outcome: string
          subject: string
        }
        Update: {
          action?: string
          actor_id?: string
          at?: string
          audit_id?: string
          metadata?: Json
          outcome?: string
          subject?: string
        }
        Relationships: []
      }
      kare_config_versions: {
        Row: {
          config_version: string
          first_seen_at: string
          published_at: string | null
          published_by: string | null
          revision: number
          source: string
        }
        Insert: {
          config_version: string
          first_seen_at?: string
          published_at?: string | null
          published_by?: string | null
          revision: number
          source: string
        }
        Update: {
          config_version?: string
          first_seen_at?: string
          published_at?: string | null
          published_by?: string | null
          revision?: number
          source?: string
        }
        Relationships: []
      }
      kare_evidence: {
        Row: {
          detail: string
          evidence_id: string
          kind: string
          label: string
          outcome: string
          produced_at: string
          produced_by: string
          task_id: string
        }
        Insert: {
          detail: string
          evidence_id: string
          kind: string
          label: string
          outcome: string
          produced_at: string
          produced_by: string
          task_id: string
        }
        Update: {
          detail?: string
          evidence_id?: string
          kind?: string
          label?: string
          outcome?: string
          produced_at?: string
          produced_by?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kare_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "kare_tasks"
            referencedColumns: ["task_id"]
          },
        ]
      }
      kare_provenance: {
        Row: {
          config_revision: number
          config_source: string
          config_version: string
          policy_ref: string | null
          recorded_at: string
          task_id: string
        }
        Insert: {
          config_revision: number
          config_source: string
          config_version: string
          policy_ref?: string | null
          recorded_at: string
          task_id: string
        }
        Update: {
          config_revision?: number
          config_source?: string
          config_version?: string
          policy_ref?: string | null
          recorded_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kare_provenance_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "kare_tasks"
            referencedColumns: ["task_id"]
          },
        ]
      }
      kare_rollbacks: {
        Row: {
          available: boolean
          correction_budget: number
          corrections_used: number
          recorded_at: string
          status: string
          task_id: string
        }
        Insert: {
          available: boolean
          correction_budget: number
          corrections_used: number
          recorded_at: string
          status: string
          task_id: string
        }
        Update: {
          available?: boolean
          correction_budget?: number
          corrections_used?: number
          recorded_at?: string
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kare_rollbacks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "kare_tasks"
            referencedColumns: ["task_id"]
          },
        ]
      }
      kare_task_executions: {
        Row: {
          agent_id: string | null
          attempt: number
          outcome: string
          recorded_at: string
          summary: string
          task_id: string
        }
        Insert: {
          agent_id?: string | null
          attempt: number
          outcome: string
          recorded_at: string
          summary: string
          task_id: string
        }
        Update: {
          agent_id?: string | null
          attempt?: number
          outcome?: string
          recorded_at?: string
          summary?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kare_task_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "kare_tasks"
            referencedColumns: ["task_id"]
          },
        ]
      }
      kare_task_transitions: {
        Row: {
          at: string
          attempt: number
          note: string
          seq: number
          state: string
          task_id: string
        }
        Insert: {
          at: string
          attempt: number
          note: string
          seq: number
          state: string
          task_id: string
        }
        Update: {
          at?: string
          attempt?: number
          note?: string
          seq?: number
          state?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kare_task_transitions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "kare_tasks"
            referencedColumns: ["task_id"]
          },
        ]
      }
      kare_tasks: {
        Row: {
          actor_id: string
          approval_decided_by: string | null
          approval_required: boolean
          approval_status: string
          attempt: number
          capability: string
          config_revision: number
          config_source: string
          config_version: string
          correction_budget: number
          corrections_used: number
          created_at: string
          objective: string
          policy_ref: string | null
          request_id: string
          risk: string
          rollback_available: boolean
          rollback_status: string
          routed_agent_id: string | null
          state: string
          task_id: string
          updated_at: string
          verdict: string
        }
        Insert: {
          actor_id: string
          approval_decided_by?: string | null
          approval_required?: boolean
          approval_status: string
          attempt?: number
          capability: string
          config_revision: number
          config_source: string
          config_version: string
          correction_budget?: number
          corrections_used?: number
          created_at: string
          objective: string
          policy_ref?: string | null
          request_id: string
          risk: string
          rollback_available?: boolean
          rollback_status: string
          routed_agent_id?: string | null
          state: string
          task_id: string
          updated_at: string
          verdict: string
        }
        Update: {
          actor_id?: string
          approval_decided_by?: string | null
          approval_required?: boolean
          approval_status?: string
          attempt?: number
          capability?: string
          config_revision?: number
          config_source?: string
          config_version?: string
          correction_budget?: number
          corrections_used?: number
          created_at?: string
          objective?: string
          policy_ref?: string | null
          request_id?: string
          risk?: string
          rollback_available?: boolean
          rollback_status?: string
          routed_agent_id?: string | null
          state?: string
          task_id?: string
          updated_at?: string
          verdict?: string
        }
        Relationships: []
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
