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
      anchor_photos: {
        Row: {
          anchor: string
          bird_id: string
          created_at: string
          id: string
          photo_path: string
          year: number
        }
        Insert: {
          anchor: string
          bird_id: string
          created_at?: string
          id?: string
          photo_path: string
          year: number
        }
        Update: {
          anchor?: string
          bird_id?: string
          created_at?: string
          id?: string
          photo_path?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "anchor_photos_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
        ]
      }
      bird_members: {
        Row: {
          bird_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          bird_id: string
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          bird_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bird_members_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
        ]
      }
      birds: {
        Row: {
          acquired_on: string | null
          age: string | null
          band_number: string | null
          birth_date: string | null
          created_at: string
          flight_status: string | null
          id: string
          lineage_notes: string | null
          medical_conditions: string | null
          medications: string | null
          microchip: string | null
          name: string
          normal_weight: number | null
          normal_weight_max: number | null
          normal_weight_min: number | null
          notes: string | null
          origin: string | null
          owner_edited_intro: string | null
          owner_id: string
          photo_position: string | null
          photo_url: string | null
          setup_complete: boolean
          setup_step: number
          sex: string | null
          sex_method: string | null
          sitter_intro: string | null
          species: string | null
          updated_at: string
        }
        Insert: {
          acquired_on?: string | null
          age?: string | null
          band_number?: string | null
          birth_date?: string | null
          created_at?: string
          flight_status?: string | null
          id?: string
          lineage_notes?: string | null
          medical_conditions?: string | null
          medications?: string | null
          microchip?: string | null
          name: string
          normal_weight?: number | null
          normal_weight_max?: number | null
          normal_weight_min?: number | null
          notes?: string | null
          origin?: string | null
          owner_edited_intro?: string | null
          owner_id: string
          photo_position?: string | null
          photo_url?: string | null
          setup_complete?: boolean
          setup_step?: number
          sex?: string | null
          sex_method?: string | null
          sitter_intro?: string | null
          species?: string | null
          updated_at?: string
        }
        Update: {
          acquired_on?: string | null
          age?: string | null
          band_number?: string | null
          birth_date?: string | null
          created_at?: string
          flight_status?: string | null
          id?: string
          lineage_notes?: string | null
          medical_conditions?: string | null
          medications?: string | null
          microchip?: string | null
          name?: string
          normal_weight?: number | null
          normal_weight_max?: number | null
          normal_weight_min?: number | null
          notes?: string | null
          origin?: string | null
          owner_edited_intro?: string | null
          owner_id?: string
          photo_position?: string | null
          photo_url?: string | null
          setup_complete?: boolean
          setup_step?: number
          sex?: string | null
          sex_method?: string | null
          sitter_intro?: string | null
          species?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      care_plans: {
        Row: {
          amount_unit: string | null
          amount_value: number | null
          baseline_clip_path: string | null
          baseline_droppings_path: string | null
          bird_id: string
          bite_risk: string | null
          cage_location: string | null
          cleaning_instructions: string | null
          clip_bedtime_path: string | null
          clip_food_water_path: string | null
          clip_locations_path: string | null
          clip_step_up_path: string | null
          created_at: string
          diet_details: Json
          diet_other: string | null
          diet_types: string[]
          fears_triggers: string | null
          feeding_times: string[]
          food_bowl_wash_cadence: string
          food_brand: string | null
          food_hygiene_notes: string | null
          food_instructions: string | null
          food_storage: string | null
          foods_never_allowed: string | null
          fresh_food_removal: string | null
          fresh_food_removal_minutes: number
          fresh_foods: string[]
          fresh_foods_other: string | null
          handlers: string | null
          handling_rules: string | null
          hazards: string[]
          hazards_other: string | null
          id: string
          known_triggers: string | null
          likes: string | null
          medication_schedule: string | null
          never_feed: string[]
          normal_activity: string | null
          normal_appetite: string | null
          normal_behavior_with_strangers: string | null
          normal_droppings: string | null
          normal_noise: string | null
          normal_sleep: string | null
          off_limits: string | null
          off_limits_rooms: string | null
          other_pets: string | null
          out_of_cage_mode: string | null
          out_of_cage_notes: string | null
          out_of_cage_rules: string | null
          safety_rules: string | null
          step_up: string | null
          step_up_notes: string | null
          treats_allowed: string | null
          treats_frequency: string | null
          treats_notes: string | null
          updated_at: string
          water_bowl_wash_cadence: string
          water_frequency: string | null
          water_instructions: string | null
          water_notes: string | null
          whats_normal: string | null
          when_to_call_owner: string | null
          when_to_call_vet: string | null
        }
        Insert: {
          amount_unit?: string | null
          amount_value?: number | null
          baseline_clip_path?: string | null
          baseline_droppings_path?: string | null
          bird_id: string
          bite_risk?: string | null
          cage_location?: string | null
          cleaning_instructions?: string | null
          clip_bedtime_path?: string | null
          clip_food_water_path?: string | null
          clip_locations_path?: string | null
          clip_step_up_path?: string | null
          created_at?: string
          diet_details?: Json
          diet_other?: string | null
          diet_types?: string[]
          fears_triggers?: string | null
          feeding_times?: string[]
          food_bowl_wash_cadence?: string
          food_brand?: string | null
          food_hygiene_notes?: string | null
          food_instructions?: string | null
          food_storage?: string | null
          foods_never_allowed?: string | null
          fresh_food_removal?: string | null
          fresh_food_removal_minutes?: number
          fresh_foods?: string[]
          fresh_foods_other?: string | null
          handlers?: string | null
          handling_rules?: string | null
          hazards?: string[]
          hazards_other?: string | null
          id?: string
          known_triggers?: string | null
          likes?: string | null
          medication_schedule?: string | null
          never_feed?: string[]
          normal_activity?: string | null
          normal_appetite?: string | null
          normal_behavior_with_strangers?: string | null
          normal_droppings?: string | null
          normal_noise?: string | null
          normal_sleep?: string | null
          off_limits?: string | null
          off_limits_rooms?: string | null
          other_pets?: string | null
          out_of_cage_mode?: string | null
          out_of_cage_notes?: string | null
          out_of_cage_rules?: string | null
          safety_rules?: string | null
          step_up?: string | null
          step_up_notes?: string | null
          treats_allowed?: string | null
          treats_frequency?: string | null
          treats_notes?: string | null
          updated_at?: string
          water_bowl_wash_cadence?: string
          water_frequency?: string | null
          water_instructions?: string | null
          water_notes?: string | null
          whats_normal?: string | null
          when_to_call_owner?: string | null
          when_to_call_vet?: string | null
        }
        Update: {
          amount_unit?: string | null
          amount_value?: number | null
          baseline_clip_path?: string | null
          baseline_droppings_path?: string | null
          bird_id?: string
          bite_risk?: string | null
          cage_location?: string | null
          cleaning_instructions?: string | null
          clip_bedtime_path?: string | null
          clip_food_water_path?: string | null
          clip_locations_path?: string | null
          clip_step_up_path?: string | null
          created_at?: string
          diet_details?: Json
          diet_other?: string | null
          diet_types?: string[]
          fears_triggers?: string | null
          feeding_times?: string[]
          food_bowl_wash_cadence?: string
          food_brand?: string | null
          food_hygiene_notes?: string | null
          food_instructions?: string | null
          food_storage?: string | null
          foods_never_allowed?: string | null
          fresh_food_removal?: string | null
          fresh_food_removal_minutes?: number
          fresh_foods?: string[]
          fresh_foods_other?: string | null
          handlers?: string | null
          handling_rules?: string | null
          hazards?: string[]
          hazards_other?: string | null
          id?: string
          known_triggers?: string | null
          likes?: string | null
          medication_schedule?: string | null
          never_feed?: string[]
          normal_activity?: string | null
          normal_appetite?: string | null
          normal_behavior_with_strangers?: string | null
          normal_droppings?: string | null
          normal_noise?: string | null
          normal_sleep?: string | null
          off_limits?: string | null
          off_limits_rooms?: string | null
          other_pets?: string | null
          out_of_cage_mode?: string | null
          out_of_cage_notes?: string | null
          out_of_cage_rules?: string | null
          safety_rules?: string | null
          step_up?: string | null
          step_up_notes?: string | null
          treats_allowed?: string | null
          treats_frequency?: string | null
          treats_notes?: string | null
          updated_at?: string
          water_bowl_wash_cadence?: string
          water_frequency?: string | null
          water_instructions?: string | null
          water_notes?: string | null
          whats_normal?: string | null
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
          run_by: string | null
          sit_id: string | null
          source: string
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
          run_by?: string | null
          sit_id?: string | null
          source?: string
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
          run_by?: string | null
          sit_id?: string | null
          source?: string
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
      journal_entries: {
        Row: {
          bird_id: string
          body: string | null
          created_at: string
          id: string
          kind: string
          logged_by: string | null
          occurred_on: string
          photo_path: string | null
          title: string | null
        }
        Insert: {
          bird_id: string
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          logged_by?: string | null
          occurred_on: string
          photo_path?: string | null
          title?: string | null
        }
        Update: {
          bird_id?: string
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          logged_by?: string | null
          occurred_on?: string
          photo_path?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
        ]
      }
      moments: {
        Row: {
          auto_generated: boolean
          bird_id: string
          created_at: string
          id: string
          kind: string
          on_date: string | null
          photo_path: string | null
          recurs: boolean
          title: string | null
        }
        Insert: {
          auto_generated?: boolean
          bird_id: string
          created_at?: string
          id?: string
          kind: string
          on_date?: string | null
          photo_path?: string | null
          recurs?: boolean
          title?: string | null
        }
        Update: {
          auto_generated?: boolean
          bird_id?: string
          created_at?: string
          id?: string
          kind?: string
          on_date?: string | null
          photo_path?: string | null
          recurs?: boolean
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moments_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
            referencedColumns: ["id"]
          },
        ]
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
          marketing_opt_in: boolean
          notify_care_plan_reminder: boolean
          notify_sitter_log: boolean
          notify_sitter_opened: boolean
          push_care_plan_reminder: boolean
          push_sitter_log: boolean
          push_sitter_opened: boolean
          signup_campaign: string | null
          signup_content: string | null
          signup_first_seen_at: string | null
          signup_landing_page: string | null
          signup_medium: string | null
          signup_referrer: string | null
          signup_source: string | null
          signup_term: string | null
          updated_at: string
          welcome_seen_at: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          marketing_opt_in?: boolean
          notify_care_plan_reminder?: boolean
          notify_sitter_log?: boolean
          notify_sitter_opened?: boolean
          push_care_plan_reminder?: boolean
          push_sitter_log?: boolean
          push_sitter_opened?: boolean
          signup_campaign?: string | null
          signup_content?: string | null
          signup_first_seen_at?: string | null
          signup_landing_page?: string | null
          signup_medium?: string | null
          signup_referrer?: string | null
          signup_source?: string | null
          signup_term?: string | null
          updated_at?: string
          welcome_seen_at?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          marketing_opt_in?: boolean
          notify_care_plan_reminder?: boolean
          notify_sitter_log?: boolean
          notify_sitter_opened?: boolean
          push_care_plan_reminder?: boolean
          push_sitter_log?: boolean
          push_sitter_opened?: boolean
          signup_campaign?: string | null
          signup_content?: string | null
          signup_first_seen_at?: string | null
          signup_landing_page?: string | null
          signup_medium?: string | null
          signup_referrer?: string | null
          signup_source?: string | null
          signup_term?: string | null
          updated_at?: string
          welcome_seen_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      sit_checklist_items: {
        Row: {
          checked: boolean
          checked_at: string
          created_at: string
          custom_label: string | null
          id: string
          is_custom: boolean
          item_key: string
          sit_id: string
          tag: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string
          created_at?: string
          custom_label?: string | null
          id?: string
          is_custom?: boolean
          item_key: string
          sit_id: string
          tag?: string
        }
        Update: {
          checked?: boolean
          checked_at?: string
          created_at?: string
          custom_label?: string | null
          id?: string
          is_custom?: boolean
          item_key?: string
          sit_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "sit_checklist_items_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_open_events: {
        Row: {
          opened_at: string
          sit_id: string
        }
        Insert: {
          opened_at?: string
          sit_id: string
        }
        Update: {
          opened_at?: string
          sit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sit_open_events_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: true
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
          marked_ready_at: string | null
          notes: string | null
          owner_id: string
          revoked: boolean
          sitter_email: string | null
          sitter_name: string | null
          start_date: string
          status: string
          title: string | null
          token_expires_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          invite_token?: string
          marked_ready_at?: string | null
          notes?: string | null
          owner_id: string
          revoked?: boolean
          sitter_email?: string | null
          sitter_name?: string | null
          start_date: string
          status?: string
          title?: string | null
          token_expires_at: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          invite_token?: string
          marked_ready_at?: string | null
          notes?: string | null
          owner_id?: string
          revoked?: boolean
          sitter_email?: string | null
          sitter_name?: string | null
          start_date?: string
          status?: string
          title?: string | null
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
      weight_entries: {
        Row: {
          bird_id: string
          created_at: string
          grams: number
          id: string
          logged_by: string | null
          meal_relation: string | null
          measured_at: string
          note: string | null
          source: string
        }
        Insert: {
          bird_id: string
          created_at?: string
          grams: number
          id?: string
          logged_by?: string | null
          meal_relation?: string | null
          measured_at?: string
          note?: string | null
          source?: string
        }
        Update: {
          bird_id?: string
          created_at?: string
          grams?: number
          id?: string
          logged_by?: string | null
          meal_relation?: string | null
          measured_at?: string
          note?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "weight_entries_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "birds"
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
      has_bird_access: { Args: { b_id: string; u_id: string }; Returns: string }
      safe_uuid: { Args: { t: string }; Returns: string }
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
