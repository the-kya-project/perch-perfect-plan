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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      birds: {
        Row: {
          age: string | null
          birth_date: string | null
          created_at: string
          flight_status: string | null
          id: string
          medical_conditions: string | null
          medications: string | null
          name: string
          normal_weight: number | null
          normal_weight_max: number | null
          normal_weight_min: number | null
          notes: string | null
          owner_id: string
          photo_position: string | null
          photo_url: string | null
          setup_complete: boolean
          setup_step: number
          sex: string | null
          species: string | null
          updated_at: string
        }
        Insert: {
          age?: string | null
          birth_date?: string | null
          created_at?: string
          flight_status?: string | null
          id?: string
          medical_conditions?: string | null
          medications?: string | null
          name: string
          normal_weight?: number | null
          normal_weight_max?: number | null
          normal_weight_min?: number | null
          notes?: string | null
          owner_id: string
          photo_position?: string | null
          photo_url?: string | null
          setup_complete?: boolean
          setup_step?: number
          sex?: string | null
          species?: string | null
          updated_at?: string
        }
        Update: {
          age?: string | null
          birth_date?: string | null
          created_at?: string
          flight_status?: string | null
          id?: string
          medical_conditions?: string | null
          medications?: string | null
          name?: string
          normal_weight?: number | null
          normal_weight_max?: number | null
          normal_weight_min?: number | null
          notes?: string | null
          owner_id?: string
          photo_position?: string | null
          photo_url?: string | null
          setup_complete?: boolean
          setup_step?: number
          sex?: string | null
          species?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      care_plans: {
        Row: {
          amount_unit: string | null
          amount_value: number | null
          bird_id: string
          cleaning_instructions: string | null
          created_at: string
          diet_other: string | null
          diet_types: string[]
          feeding_times: string[]
          food_brand: string | null
          food_instructions: string | null
          food_storage: string | null
          foods_never_allowed: string | null
          fresh_food_removal: string | null
          fresh_foods: string[]
          fresh_foods_other: string | null
          handling_rules: string | null
          id: string
          known_triggers: string | null
          never_feed: string[]
          normal_activity: string | null
          normal_appetite: string | null
          normal_behavior_with_strangers: string | null
          normal_droppings: string | null
          normal_noise: string | null
          normal_sleep: string | null
          off_limits_rooms: string | null
          other_pets: string | null
          out_of_cage_rules: string | null
          safety_rules: string | null
          treats_allowed: string | null
          treats_frequency: string | null
          treats_notes: string | null
          updated_at: string
          water_frequency: string | null
          water_instructions: string | null
          water_notes: string | null
          when_to_call_owner: string | null
          when_to_call_vet: string | null
        }
        Insert: {
          amount_unit?: string | null
          amount_value?: number | null
          bird_id: string
          cleaning_instructions?: string | null
          created_at?: string
          diet_other?: string | null
          diet_types?: string[]
          feeding_times?: string[]
          food_brand?: string | null
          food_instructions?: string | null
          food_storage?: string | null
          foods_never_allowed?: string | null
          fresh_food_removal?: string | null
          fresh_foods?: string[]
          fresh_foods_other?: string | null
          handling_rules?: string | null
          id?: string
          known_triggers?: string | null
          never_feed?: string[]
          normal_activity?: string | null
          normal_appetite?: string | null
          normal_behavior_with_strangers?: string | null
          normal_droppings?: string | null
          normal_noise?: string | null
          normal_sleep?: string | null
          off_limits_rooms?: string | null
          other_pets?: string | null
          out_of_cage_rules?: string | null
          safety_rules?: string | null
          treats_allowed?: string | null
          treats_frequency?: string | null
          treats_notes?: string | null
          updated_at?: string
          water_frequency?: string | null
          water_instructions?: string | null
          water_notes?: string | null
          when_to_call_owner?: string | null
          when_to_call_vet?: string | null
        }
        Update: {
          amount_unit?: string | null
          amount_value?: number | null
          bird_id?: string
          cleaning_instructions?: string | null
          created_at?: string
          diet_other?: string | null
          diet_types?: string[]
          feeding_times?: string[]
          food_brand?: string | null
          food_instructions?: string | null
          food_storage?: string | null
          foods_never_allowed?: string | null
          fresh_food_removal?: string | null
          fresh_foods?: string[]
          fresh_foods_other?: string | null
          handling_rules?: string | null
          id?: string
          known_triggers?: string | null
          never_feed?: string[]
          normal_activity?: string | null
          normal_appetite?: string | null
          normal_behavior_with_strangers?: string | null
          normal_droppings?: string | null
          normal_noise?: string | null
          normal_sleep?: string | null
          off_limits_rooms?: string | null
          other_pets?: string | null
          out_of_cage_rules?: string | null
          safety_rules?: string | null
          treats_allowed?: string | null
          treats_frequency?: string | null
          treats_notes?: string | null
          updated_at?: string
          water_frequency?: string | null
          water_instructions?: string | null
          water_notes?: string | null
          when_to_call_owner?: string | null
          when_to_call_vet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_plans_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: true
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          alertness_status: string | null
          behavior_status: string | null
          bird_id: string
          breathing_status: string | null
          created_at: string
          droppings_status: string | null
          energy_status: string | null
          exposure_status: string | null
          food_status: string | null
          id: string
          injury_status: string | null
          log_date: string
          notes: string | null
          posture_status: string | null
          sit_id: string | null
          triage_reasons: string | null
          triage_status: string
          water_status: string | null
        }
        Insert: {
          alertness_status?: string | null
          behavior_status?: string | null
          bird_id: string
          breathing_status?: string | null
          created_at?: string
          droppings_status?: string | null
          energy_status?: string | null
          exposure_status?: string | null
          food_status?: string | null
          id?: string
          injury_status?: string | null
          log_date?: string
          notes?: string | null
          posture_status?: string | null
          sit_id?: string | null
          triage_reasons?: string | null
          triage_status?: string
          water_status?: string | null
        }
        Update: {
          alertness_status?: string | null
          behavior_status?: string | null
          bird_id?: string
          breathing_status?: string | null
          created_at?: string
          droppings_status?: string | null
          energy_status?: string | null
          exposure_status?: string | null
          food_status?: string | null
          id?: string
          injury_status?: string | null
          log_date?: string
          notes?: string | null
          posture_status?: string | null
          sit_id?: string | null
          triage_reasons?: string | null
          triage_status?: string
          water_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          avian_vet_address: string | null
          avian_vet_name: string | null
          avian_vet_phone: string | null
          backup_name: string | null
          backup_phone: string | null
          bird_id: string
          carrier_location: string | null
          emergency_authorization: string | null
          emergency_vet_address: string | null
          emergency_vet_name: string | null
          emergency_vet_phone: string | null
          first_aid_kit_location: string | null
          id: string
          owner_phone: string | null
          poison_control: string | null
          spending_limit: string | null
          updated_at: string
        }
        Insert: {
          avian_vet_address?: string | null
          avian_vet_name?: string | null
          avian_vet_phone?: string | null
          backup_name?: string | null
          backup_phone?: string | null
          bird_id: string
          carrier_location?: string | null
          emergency_authorization?: string | null
          emergency_vet_address?: string | null
          emergency_vet_name?: string | null
          emergency_vet_phone?: string | null
          first_aid_kit_location?: string | null
          id?: string
          owner_phone?: string | null
          poison_control?: string | null
          spending_limit?: string | null
          updated_at?: string
        }
        Update: {
          avian_vet_address?: string | null
          avian_vet_name?: string | null
          avian_vet_phone?: string | null
          backup_name?: string | null
          backup_phone?: string | null
          bird_id?: string
          carrier_location?: string | null
          emergency_authorization?: string | null
          emergency_vet_address?: string | null
          emergency_vet_name?: string | null
          emergency_vet_phone?: string | null
          first_aid_kit_location?: string | null
          id?: string
          owner_phone?: string | null
          poison_control?: string | null
          spending_limit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: true
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_cards: {
        Row: {
          category: string
          created_at: string
          emergency_level: string
          id: string
          quick_answer: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_keywords: string | null
          slug: string
          title: string
          what_to_check: string | null
          what_to_do: string | null
          when_to_call_vet: string | null
        }
        Insert: {
          category: string
          created_at?: string
          emergency_level?: string
          id?: string
          quick_answer?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_keywords?: string | null
          slug: string
          title: string
          what_to_check?: string | null
          what_to_do?: string | null
          when_to_call_vet?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          emergency_level?: string
          id?: string
          quick_answer?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_keywords?: string | null
          slug?: string
          title?: string
          what_to_check?: string | null
          what_to_do?: string | null
          when_to_call_vet?: string | null
        }
        Relationships: []
      }
      owner_emergency_defaults: {
        Row: {
          avian_vet_address: string | null
          avian_vet_name: string | null
          avian_vet_phone: string | null
          backup_name: string | null
          backup_phone: string | null
          carrier_location: string | null
          emergency_authorization: string | null
          emergency_vet_address: string | null
          emergency_vet_name: string | null
          emergency_vet_phone: string | null
          first_aid_kit_location: string | null
          owner_id: string
          owner_phone: string | null
          poison_control: string | null
          spending_limit: string | null
          updated_at: string
        }
        Insert: {
          avian_vet_address?: string | null
          avian_vet_name?: string | null
          avian_vet_phone?: string | null
          backup_name?: string | null
          backup_phone?: string | null
          carrier_location?: string | null
          emergency_authorization?: string | null
          emergency_vet_address?: string | null
          emergency_vet_name?: string | null
          emergency_vet_phone?: string | null
          first_aid_kit_location?: string | null
          owner_id: string
          owner_phone?: string | null
          poison_control?: string | null
          spending_limit?: string | null
          updated_at?: string
        }
        Update: {
          avian_vet_address?: string | null
          avian_vet_name?: string | null
          avian_vet_phone?: string | null
          backup_name?: string | null
          backup_phone?: string | null
          carrier_location?: string | null
          emergency_authorization?: string | null
          emergency_vet_address?: string | null
          emergency_vet_name?: string | null
          emergency_vet_phone?: string | null
          first_aid_kit_location?: string | null
          owner_id?: string
          owner_phone?: string | null
          poison_control?: string | null
          spending_limit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      photo_logs: {
        Row: {
          bird_id: string
          created_at: string
          daily_log_id: string | null
          id: string
          notes: string | null
          photo_type: string
          photo_url: string
          sit_id: string | null
        }
        Insert: {
          bird_id: string
          created_at?: string
          daily_log_id?: string | null
          id?: string
          notes?: string | null
          photo_type?: string
          photo_url: string
          sit_id?: string | null
        }
        Update: {
          bird_id?: string
          created_at?: string
          daily_log_id?: string | null
          id?: string
          notes?: string | null
          photo_type?: string
          photo_url?: string
          sit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_logs_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_logs_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_logs_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      routine_tasks: {
        Row: {
          care_plan_id: string
          category: string
          created_at: string
          guide_card_id: string | null
          id: string
          instructions: string | null
          required: boolean
          sitter_completable: boolean
          sort_order: number
          time_of_day: string | null
          title: string
        }
        Insert: {
          care_plan_id: string
          category?: string
          created_at?: string
          guide_card_id?: string | null
          id?: string
          instructions?: string | null
          required?: boolean
          sitter_completable?: boolean
          sort_order?: number
          time_of_day?: string | null
          title: string
        }
        Update: {
          care_plan_id?: string
          category?: string
          created_at?: string
          guide_card_id?: string | null
          id?: string
          instructions?: string | null
          required?: boolean
          sitter_completable?: boolean
          sort_order?: number
          time_of_day?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_tasks_care_plan_id_fkey"
            columns: ["care_plan_id"]
            isOneToOne: false
            referencedRelation: "care_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_birds: {
        Row: {
          bird_id: string
          created_at: string
          sit_id: string
        }
        Insert: {
          bird_id: string
          created_at?: string
          sit_id: string
        }
        Update: {
          bird_id?: string
          created_at?: string
          sit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sit_birds_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sit_birds_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      sits: {
        Row: {
          created_at: string
          end_date: string
          id: string
          invite_token: string
          notes: string | null
          owner_id: string
          revoked: boolean
          sitter_email: string | null
          sitter_name: string | null
          start_date: string
          status: string
          token_expires_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          invite_token?: string
          notes?: string | null
          owner_id: string
          revoked?: boolean
          sitter_email?: string | null
          sitter_name?: string | null
          start_date: string
          status?: string
          token_expires_at: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          invite_token?: string
          notes?: string | null
          owner_id?: string
          revoked?: boolean
          sitter_email?: string | null
          sitter_name?: string | null
          start_date?: string
          status?: string
          token_expires_at?: string
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          completed_at: string
          completed_date: string
          id: string
          notes: string | null
          routine_task_id: string
          sit_id: string
        }
        Insert: {
          completed_at?: string
          completed_date?: string
          id?: string
          notes?: string | null
          routine_task_id: string
          sit_id: string
        }
        Update: {
          completed_at?: string
          completed_date?: string
          id?: string
          notes?: string | null
          routine_task_id?: string
          sit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_routine_task_id_fkey"
            columns: ["routine_task_id"]
            isOneToOne: false
            referencedRelation: "routine_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          bird_id: string
          id: string
          logged_at: string
          notes: string | null
          sit_id: string | null
          weight: number
        }
        Insert: {
          bird_id: string
          id?: string
          logged_at?: string
          notes?: string | null
          sit_id?: string | null
          weight: number
        }
        Update: {
          bird_id?: string
          id?: string
          logged_at?: string
          notes?: string | null
          sit_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
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
