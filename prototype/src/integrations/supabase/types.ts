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
      application_events: {
        Row: {
          actor_id: string | null
          application_id: string
          created_at: string
          from_state: Database["public"]["Enums"]["application_state"] | null
          household_id: string
          id: string
          is_backward: boolean
          note: string | null
          to_state: Database["public"]["Enums"]["application_state"]
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["application_state"] | null
          household_id: string
          id?: string
          is_backward?: boolean
          note?: string | null
          to_state: Database["public"]["Enums"]["application_state"]
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["application_state"] | null
          household_id?: string
          id?: string
          is_backward?: boolean
          note?: string | null
          to_state?: Database["public"]["Enums"]["application_state"]
        }
        Relationships: [
          {
            foreignKeyName: "application_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          age: number | null
          applicant_name: string
          became_resident_id: string | null
          contact: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          message: string | null
          round_id: string
          source: Database["public"]["Enums"]["info_source"]
          state: Database["public"]["Enums"]["application_state"]
        }
        Insert: {
          age?: number | null
          applicant_name: string
          became_resident_id?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          message?: string | null
          round_id: string
          source?: Database["public"]["Enums"]["info_source"]
          state?: Database["public"]["Enums"]["application_state"]
        }
        Update: {
          age?: number | null
          applicant_name?: string
          became_resident_id?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          message?: string | null
          round_id?: string
          source?: Database["public"]["Enums"]["info_source"]
          state?: Database["public"]["Enums"]["application_state"]
        }
        Relationships: [
          {
            foreignKeyName: "applications_became_resident_id_fkey"
            columns: ["became_resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          address: string | null
          created_at: string
          favorite_budget_factor: number
          hide_results_until_voted: boolean
          id: string
          name: string
          quorum_share: number
          scale_weights: Json
        }
        Insert: {
          address?: string | null
          created_at?: string
          favorite_budget_factor?: number
          hide_results_until_voted?: boolean
          id?: string
          name: string
          quorum_share?: number
          scale_weights?: Json
        }
        Update: {
          address?: string | null
          created_at?: string
          favorite_budget_factor?: number
          hide_results_until_voted?: boolean
          id?: string
          name?: string
          quorum_share?: number
          scale_weights?: Json
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string | null
          code_hash: string
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          label: string | null
          max_uses: number
          revoked: boolean
          updated_at: string
          used_count: number
        }
        Insert: {
          code?: string | null
          code_hash: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          household_id: string
          id?: string
          label?: string | null
          max_uses?: number
          revoked?: boolean
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string | null
          code_hash?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          label?: string | null
          max_uses?: number
          revoked?: boolean
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          last_seen_at: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          last_seen_at?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          last_seen_at?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          about: string | null
          contact: string | null
          created_at: string
          display_name: string
          household_id: string
          id: string
          is_voter: boolean
          moved_in_on: string | null
          moved_out_on: string | null
          status: Database["public"]["Enums"]["member_status"]
          user_id: string | null
        }
        Insert: {
          about?: string | null
          contact?: string | null
          created_at?: string
          display_name: string
          household_id: string
          id?: string
          is_voter?: boolean
          moved_in_on?: string | null
          moved_out_on?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string | null
        }
        Update: {
          about?: string | null
          contact?: string | null
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
          is_voter?: boolean
          moved_in_on?: string | null
          moved_out_on?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          available_from: string | null
          created_at: string
          household_id: string
          id: string
          name: string
          size_sqm: number | null
          status: Database["public"]["Enums"]["room_status"]
        }
        Insert: {
          available_from?: string | null
          created_at?: string
          household_id: string
          id?: string
          name: string
          size_sqm?: number | null
          status?: Database["public"]["Enums"]["room_status"]
        }
        Update: {
          available_from?: string | null
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          size_sqm?: number | null
          status?: Database["public"]["Enums"]["room_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rooms_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      round_participants: {
        Row: {
          created_at: string
          profile_id: string
          round_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          round_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_participants_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_rooms: {
        Row: {
          room_id: string
          round_id: string
        }
        Insert: {
          room_id: string
          round_id: string
        }
        Update: {
          room_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_rooms_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          closed_at: string | null
          created_at: string
          hide_results_until_voted: boolean
          household_id: string
          id: string
          opened_at: string | null
          phase_deadline_at: string | null
          quorum_share: number
          settings_snapshot: Json
          status: Database["public"]["Enums"]["round_status"]
          title: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          hide_results_until_voted?: boolean
          household_id: string
          id?: string
          opened_at?: string | null
          phase_deadline_at?: string | null
          quorum_share?: number
          settings_snapshot?: Json
          status?: Database["public"]["Enums"]["round_status"]
          title: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          hide_results_until_voted?: boolean
          household_id?: string
          id?: string
          opened_at?: string | null
          phase_deadline_at?: string | null
          quorum_share?: number
          settings_snapshot?: Json
          status?: Database["public"]["Enums"]["round_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          application_id: string
          created_at: string
          id: string
          stage: Database["public"]["Enums"]["vote_stage"]
          updated_at: string
          value: Database["public"]["Enums"]["vote_value"]
          voter_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          stage?: Database["public"]["Enums"]["vote_stage"]
          updated_at?: string
          value: Database["public"]["Enums"]["vote_value"]
          voter_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          stage?: Database["public"]["Enums"]["vote_stage"]
          updated_at?: string
          value?: Database["public"]["Enums"]["vote_value"]
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_household_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _profile_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_household_account: { Args: never; Returns: boolean }
      reset_demo_household: { Args: never; Returns: undefined }
      round_ranking: {
        Args: { _round_id: string }
        Returns: {
          applicant_name: string
          application_id: string
          c_definitely: number
          c_good: number
          c_no: number
          c_rather_not: number
          created_at: string
          is_self: boolean
          my_vote: Database["public"]["Enums"]["vote_value"]
          quorum_reached: boolean
          score: number
          state: Database["public"]["Enums"]["application_state"]
          visible: boolean
          vote_count: number
          votes_needed: number
        }[]
      }
      round_vote_stats: {
        Args: { _round_id: string }
        Returns: {
          total_votes: number
          voters_voted: number
        }[]
      }
      round_voters_count: { Args: { _round_id: string }; Returns: number }
      seed_demo_household: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "household_account"
        | "moderator"
        | "resident"
        | "former_resident"
      application_state:
        | "new"
        | "screened"
        | "invited"
        | "scheduled"
        | "interviewed"
        | "offer_made"
        | "moved_in"
        | "rejected_by_household"
        | "declined_by_applicant"
        | "withdrawn"
        | "archived"
      info_source: "applicant" | "third_party"
      member_status: "active" | "moved_out"
      room_status: "open" | "promised" | "occupied"
      round_status: "draft" | "open" | "closed" | "archived"
      vote_stage: "invite" | "offer"
      vote_value: "no" | "rather_not" | "good" | "definitely"
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
      app_role: [
        "household_account",
        "moderator",
        "resident",
        "former_resident",
      ],
      application_state: [
        "new",
        "screened",
        "invited",
        "scheduled",
        "interviewed",
        "offer_made",
        "moved_in",
        "rejected_by_household",
        "declined_by_applicant",
        "withdrawn",
        "archived",
      ],
      info_source: ["applicant", "third_party"],
      member_status: ["active", "moved_out"],
      room_status: ["open", "promised", "occupied"],
      round_status: ["draft", "open", "closed", "archived"],
      vote_stage: ["invite", "offer"],
      vote_value: ["no", "rather_not", "good", "definitely"],
    },
  },
} as const
