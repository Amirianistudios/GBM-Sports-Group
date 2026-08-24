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
      alerts: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          player_event_id: string | null
          player_id: string | null
          severity: number
          title: string
          user_id: string | null
          watchlist_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          player_event_id?: string | null
          player_id?: string | null
          severity?: number
          title: string
          user_id?: string | null
          watchlist_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          player_event_id?: string | null
          player_id?: string | null
          severity?: number
          title?: string
          user_id?: string | null
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_player_event_id_fkey"
            columns: ["player_event_id"]
            isOneToOne: false
            referencedRelation: "player_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "alerts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "alerts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      club_aliases: {
        Row: {
          alias: string
          club_id: string
          created_at: string
          id: string
          normalized_alias: string | null
          source: string | null
        }
        Insert: {
          alias: string
          club_id: string
          created_at?: string
          id?: string
          normalized_alias?: string | null
          source?: string | null
        }
        Update: {
          alias?: string
          club_id?: string
          created_at?: string
          id?: string
          normalized_alias?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_aliases_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_external_ids: {
        Row: {
          club_id: string
          confidence: number
          created_at: string
          external_id: string
          id: string
          namespace: string | null
          provider_code: string
          url: string | null
          verified_at: string | null
        }
        Insert: {
          club_id: string
          confidence?: number
          created_at?: string
          external_id: string
          id?: string
          namespace?: string | null
          provider_code: string
          url?: string | null
          verified_at?: string | null
        }
        Update: {
          club_id?: string
          confidence?: number
          created_at?: string
          external_id?: string
          id?: string
          namespace?: string | null
          provider_code?: string
          url?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_external_ids_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_external_ids_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      clubs: {
        Row: {
          city: string | null
          country_id: string | null
          created_at: string
          crest_url: string | null
          founded_year: number | null
          id: string
          is_national_team: boolean
          name: string
          normalized_name: string | null
          official_name: string | null
          short_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          country_id?: string | null
          created_at?: string
          crest_url?: string | null
          founded_year?: number | null
          id?: string
          is_national_team?: boolean
          name: string
          normalized_name?: string | null
          official_name?: string | null
          short_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          country_id?: string | null
          created_at?: string
          crest_url?: string | null
          founded_year?: number | null
          id?: string
          is_national_team?: boolean
          name?: string
          normalized_name?: string | null
          official_name?: string | null
          short_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_external_ids: {
        Row: {
          competition_id: string
          confidence: number
          created_at: string
          external_id: string
          id: string
          namespace: string | null
          provider_code: string
          url: string | null
          verified_at: string | null
        }
        Insert: {
          competition_id: string
          confidence?: number
          created_at?: string
          external_id: string
          id?: string
          namespace?: string | null
          provider_code: string
          url?: string | null
          verified_at?: string | null
        }
        Update: {
          competition_id?: string
          confidence?: number
          created_at?: string
          external_id?: string
          id?: string
          namespace?: string | null
          provider_code?: string
          url?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_external_ids_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_external_ids_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "competition_external_ids_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "competition_external_ids_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      competitions: {
        Row: {
          area_name: string | null
          country_id: string | null
          created_at: string
          gender: Database["public"]["Enums"]["competition_gender"]
          id: string
          is_youth: boolean
          name: string
          normalized_name: string | null
          short_name: string | null
          strength_rating: number | null
          tier: Database["public"]["Enums"]["competition_tier"]
          updated_at: string
        }
        Insert: {
          area_name?: string | null
          country_id?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["competition_gender"]
          id?: string
          is_youth?: boolean
          name: string
          normalized_name?: string | null
          short_name?: string | null
          strength_rating?: number | null
          tier?: Database["public"]["Enums"]["competition_tier"]
          updated_at?: string
        }
        Update: {
          area_name?: string | null
          country_id?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["competition_gender"]
          id?: string
          is_youth?: boolean
          name?: string
          normalized_name?: string | null
          short_name?: string | null
          strength_rating?: number | null
          tier?: Database["public"]["Enums"]["competition_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          club_id: string | null
          created_at: string
          expires_on: string | null
          id: string
          is_loan: boolean
          loan_expires_on: string | null
          option_until: string | null
          player_id: string
          provider_code: string
          retrieved_at: string
          source_url: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          is_loan?: boolean
          loan_expires_on?: string | null
          option_until?: string | null
          player_id: string
          provider_code: string
          retrieved_at?: string
          source_url?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          expires_on?: string | null
          id?: string
          is_loan?: boolean
          loan_expires_on?: string | null
          option_until?: string | null
          player_id?: string
          provider_code?: string
          retrieved_at?: string
          source_url?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "contracts_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      countries: {
        Row: {
          confederation: string | null
          created_at: string
          id: string
          iso2: string | null
          iso3: string | null
          name: string
          normalized_name: string | null
        }
        Insert: {
          confederation?: string | null
          created_at?: string
          id?: string
          iso2?: string | null
          iso3?: string | null
          name: string
          normalized_name?: string | null
        }
        Update: {
          confederation?: string | null
          created_at?: string
          id?: string
          iso2?: string | null
          iso3?: string | null
          name?: string
          normalized_name?: string | null
        }
        Relationships: []
      }
      data_providers: {
        Row: {
          code: string
          created_at: string
          default_priority: number
          homepage: string | null
          is_active: boolean
          kind: string
          name: string
          notes: string | null
          requires_credentials: boolean
        }
        Insert: {
          code: string
          created_at?: string
          default_priority?: number
          homepage?: string | null
          is_active?: boolean
          kind?: string
          name: string
          notes?: string | null
          requires_credentials?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          default_priority?: number
          homepage?: string | null
          is_active?: boolean
          kind?: string
          name?: string
          notes?: string | null
          requires_credentials?: boolean
        }
        Relationships: []
      }
      discovery_signals: {
        Row: {
          computed_at: string
          evidence: Json
          id: string
          is_current: boolean
          model_version: string
          player_id: string
          rationale: string | null
          score: number
          season_id: string | null
          signal_type: string
        }
        Insert: {
          computed_at?: string
          evidence?: Json
          id?: string
          is_current?: boolean
          model_version?: string
          player_id: string
          rationale?: string | null
          score: number
          season_id?: string | null
          signal_type: string
        }
        Update: {
          computed_at?: string
          evidence?: Json
          id?: string
          is_current?: boolean
          model_version?: string
          player_id?: string
          rationale?: string | null
          score?: number
          season_id?: string | null
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_signals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_signals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "discovery_signals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "discovery_signals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "discovery_signals_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_resolution_candidates: {
        Row: {
          candidate_payload: Json
          club_id: string | null
          confidence: number
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          external_id: string
          id: string
          match_method: string
          match_signals: Json
          namespace: string | null
          player_id: string | null
          provider_code: string
          status: string
        }
        Insert: {
          candidate_payload?: Json
          club_id?: string | null
          confidence: number
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          external_id: string
          id?: string
          match_method: string
          match_signals?: Json
          namespace?: string | null
          player_id?: string | null
          provider_code: string
          status?: string
        }
        Update: {
          candidate_payload?: Json
          club_id?: string | null
          confidence?: number
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          external_id?: string
          id?: string
          match_method?: string
          match_signals?: Json
          namespace?: string | null
          player_id?: string | null
          provider_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_resolution_candidates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_resolution_candidates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_resolution_candidates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "entity_resolution_candidates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "entity_resolution_candidates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "entity_resolution_candidates_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      entity_resolution_reviews: {
        Row: {
          candidate_id: string
          decided_at: string
          decision: string
          id: string
          notes: string | null
          reviewer_id: string | null
        }
        Insert: {
          candidate_id: string
          decided_at?: string
          decision: string
          id?: string
          notes?: string | null
          reviewer_id?: string | null
        }
        Update: {
          candidate_id?: string
          decided_at?: string
          decision?: string
          id?: string
          notes?: string | null
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_resolution_reviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "entity_resolution_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_resolution_rules: {
        Row: {
          auto_accept: boolean
          confidence: number
          created_at: string
          description: string | null
          id: string
          match_method: string
        }
        Insert: {
          auto_accept?: boolean
          confidence: number
          created_at?: string
          description?: string | null
          id?: string
          match_method: string
        }
        Update: {
          auto_accept?: boolean
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          match_method?: string
        }
        Relationships: []
      }
      gbm_portfolio: {
        Row: {
          assigned_staff_id: string | null
          created_at: string
          created_by: string | null
          notes: string | null
          player_id: string
          representation_end: string | null
          representation_start: string | null
          status: Database["public"]["Enums"]["gbm_portfolio_status"]
          updated_at: string
          verification_note: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          created_at?: string
          created_by?: string | null
          notes?: string | null
          player_id: string
          representation_end?: string | null
          representation_start?: string | null
          status?: Database["public"]["Enums"]["gbm_portfolio_status"]
          updated_at?: string
          verification_note?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          created_at?: string
          created_by?: string | null
          notes?: string | null
          player_id?: string
          representation_end?: string | null
          representation_start?: string | null
          status?: Database["public"]["Enums"]["gbm_portfolio_status"]
          updated_at?: string
          verification_note?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      gbm_target_markets: {
        Row: {
          citizenship_target: boolean
          country_name: string
          league_target: boolean
          note: string | null
        }
        Insert: {
          citizenship_target?: boolean
          country_name: string
          league_target?: boolean
          note?: string | null
        }
        Update: {
          citizenship_target?: boolean
          country_name?: string
          league_target?: boolean
          note?: string | null
        }
        Relationships: []
      }
      ingestion_errors: {
        Row: {
          detail: Json | null
          external_id: string | null
          id: string
          job_key: string | null
          message: string
          occurred_at: string
          provider_code: string | null
          resource_type: string | null
          run_id: string | null
        }
        Insert: {
          detail?: Json | null
          external_id?: string | null
          id?: string
          job_key?: string | null
          message: string
          occurred_at?: string
          provider_code?: string | null
          resource_type?: string | null
          run_id?: string | null
        }
        Update: {
          detail?: Json | null
          external_id?: string | null
          id?: string
          job_key?: string | null
          message?: string
          occurred_at?: string
          provider_code?: string | null
          resource_type?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_errors_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ingestion_errors_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          key: string
          last_run_at: string | null
          last_status: string | null
          name: string
          provider_code: string | null
          schedule_cron: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key: string
          last_run_at?: string | null
          last_status?: string | null
          name: string
          provider_code?: string | null
          schedule_cron?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key?: string
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          provider_code?: string | null
          schedule_cron?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          error_count: number
          finished_at: string | null
          id: string
          job_id: string | null
          job_key: string
          params: Json
          provider_code: string | null
          records_created: number
          records_fetched: number
          records_skipped: number
          records_updated: number
          started_at: string
          status: string
          summary: Json
          triggered_by: string | null
        }
        Insert: {
          error_count?: number
          finished_at?: string | null
          id?: string
          job_id?: string | null
          job_key: string
          params?: Json
          provider_code?: string | null
          records_created?: number
          records_fetched?: number
          records_skipped?: number
          records_updated?: number
          started_at?: string
          status?: string
          summary?: Json
          triggered_by?: string | null
        }
        Update: {
          error_count?: number
          finished_at?: string | null
          id?: string
          job_id?: string | null
          job_key?: string
          params?: Json
          provider_code?: string | null
          records_created?: number
          records_fetched?: number
          records_skipped?: number
          records_updated?: number
          started_at?: string
          status?: string
          summary?: Json
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_runs_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      intel_adaptation_assessments: {
        Row: {
          adaptation_risk: string | null
          agent_id: string
          competition_gap: string | null
          confidence: number | null
          created_at: string
          from_competition_id: string | null
          from_competition_name: string | null
          id: string
          is_current: boolean
          next_step: string | null
          player_id: string
          rationale: string | null
          risk_score: number | null
          submission_id: string | null
          technical_gap: string | null
          to_competition_id: string | null
          to_competition_name: string | null
        }
        Insert: {
          adaptation_risk?: string | null
          agent_id: string
          competition_gap?: string | null
          confidence?: number | null
          created_at?: string
          from_competition_id?: string | null
          from_competition_name?: string | null
          id?: string
          is_current?: boolean
          next_step?: string | null
          player_id: string
          rationale?: string | null
          risk_score?: number | null
          submission_id?: string | null
          technical_gap?: string | null
          to_competition_id?: string | null
          to_competition_name?: string | null
        }
        Update: {
          adaptation_risk?: string | null
          agent_id?: string
          competition_gap?: string | null
          confidence?: number | null
          created_at?: string
          from_competition_id?: string | null
          from_competition_name?: string | null
          id?: string
          is_current?: boolean
          next_step?: string | null
          player_id?: string
          rationale?: string | null
          risk_score?: number | null
          submission_id?: string | null
          technical_gap?: string | null
          to_competition_id?: string | null
          to_competition_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_adaptation_assessments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "intel_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_from_competition_id_fkey"
            columns: ["from_competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_from_competition_id_fkey"
            columns: ["from_competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_from_competition_id_fkey"
            columns: ["from_competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intel_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_to_competition_id_fkey"
            columns: ["to_competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_to_competition_id_fkey"
            columns: ["to_competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "intel_adaptation_assessments_to_competition_id_fkey"
            columns: ["to_competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
        ]
      }
      intel_agents: {
        Row: {
          agent_code: string
          auth_user_id: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          provider_code: string
          scopes: string[]
        }
        Insert: {
          agent_code: string
          auth_user_id: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          provider_code: string
          scopes?: string[]
        }
        Update: {
          agent_code?: string
          auth_user_id?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          provider_code?: string
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "intel_agents_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      intel_recommendations: {
        Row: {
          age_profile: string | null
          agent_id: string
          confidence: number | null
          created_at: string
          development_potential: string | null
          financial_band: string | null
          fit_label: string | null
          id: string
          is_current: boolean
          player_id: string
          playing_style: string | null
          rationale: string | null
          recommendation: Database["public"]["Enums"]["recommendation"]
          report_id: string | null
          resale_potential: string | null
          submission_id: string | null
          target_club_id: string | null
          target_competition_id: string | null
        }
        Insert: {
          age_profile?: string | null
          agent_id: string
          confidence?: number | null
          created_at?: string
          development_potential?: string | null
          financial_band?: string | null
          fit_label?: string | null
          id?: string
          is_current?: boolean
          player_id: string
          playing_style?: string | null
          rationale?: string | null
          recommendation: Database["public"]["Enums"]["recommendation"]
          report_id?: string | null
          resale_potential?: string | null
          submission_id?: string | null
          target_club_id?: string | null
          target_competition_id?: string | null
        }
        Update: {
          age_profile?: string | null
          agent_id?: string
          confidence?: number | null
          created_at?: string
          development_potential?: string | null
          financial_band?: string | null
          fit_label?: string | null
          id?: string
          is_current?: boolean
          player_id?: string
          playing_style?: string | null
          rationale?: string | null
          recommendation?: Database["public"]["Enums"]["recommendation"]
          report_id?: string | null
          resale_potential?: string | null
          submission_id?: string | null
          target_club_id?: string | null
          target_competition_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_recommendations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "intel_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_recommendations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_recommendations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_recommendations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "intel_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intel_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendations_target_club_id_fkey"
            columns: ["target_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendations_target_competition_id_fkey"
            columns: ["target_competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_recommendations_target_competition_id_fkey"
            columns: ["target_competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "intel_recommendations_target_competition_id_fkey"
            columns: ["target_competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
        ]
      }
      intel_reports: {
        Row: {
          agent_id: string
          confidence: number | null
          created_at: string
          headline: string
          id: string
          is_current: boolean
          metrics: Json | null
          model_name: string | null
          period_end: string | null
          period_start: string | null
          player_id: string
          report_type: string
          sections: Json
          sources: Json
          submission_id: string | null
          summary: string | null
          supersedes_id: string | null
          version: number
        }
        Insert: {
          agent_id: string
          confidence?: number | null
          created_at?: string
          headline: string
          id?: string
          is_current?: boolean
          metrics?: Json | null
          model_name?: string | null
          period_end?: string | null
          period_start?: string | null
          player_id: string
          report_type: string
          sections?: Json
          sources?: Json
          submission_id?: string | null
          summary?: string | null
          supersedes_id?: string | null
          version?: number
        }
        Update: {
          agent_id?: string
          confidence?: number | null
          created_at?: string
          headline?: string
          id?: string
          is_current?: boolean
          metrics?: Json | null
          model_name?: string | null
          period_end?: string | null
          period_start?: string | null
          player_id?: string
          report_type?: string
          sections?: Json
          sources?: Json
          submission_id?: string | null
          summary?: string | null
          supersedes_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "intel_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "intel_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intel_reports_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "intel_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_reports_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "intel_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_submissions: {
        Row: {
          agent_id: string
          error: string | null
          id: string
          kind: string
          payload: Json
          payload_hash: string
          received_at: string
          result: Json | null
          status: string
          submission_key: string
        }
        Insert: {
          agent_id: string
          error?: string | null
          id?: string
          kind: string
          payload: Json
          payload_hash: string
          received_at?: string
          result?: Json | null
          status: string
          submission_key: string
        }
        Update: {
          agent_id?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
          payload_hash?: string
          received_at?: string
          result?: Json | null
          status?: string
          submission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_submissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "intel_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      market_values: {
        Row: {
          age_at_valuation: number | null
          club_id: string | null
          created_at: string
          currency: string
          id: string
          player_id: string
          provider_code: string
          retrieved_at: string
          source_url: string | null
          value_amount: number
          valued_on: string
        }
        Insert: {
          age_at_valuation?: number | null
          club_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          player_id: string
          provider_code: string
          retrieved_at?: string
          source_url?: string | null
          value_amount: number
          valued_on: string
        }
        Update: {
          age_at_valuation?: number | null
          club_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          player_id?: string
          provider_code?: string
          retrieved_at?: string
          source_url?: string | null
          value_amount?: number
          valued_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_values_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      match_external_ids: {
        Row: {
          created_at: string
          external_id: string
          id: string
          match_id: string
          namespace: string | null
          provider_code: string
          url: string | null
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          match_id: string
          namespace?: string | null
          provider_code: string
          url?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          match_id?: string
          namespace?: string | null
          provider_code?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_external_ids_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_external_ids_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      matches: {
        Row: {
          away_club_id: string | null
          away_score: number | null
          competition_id: string | null
          created_at: string
          home_club_id: string | null
          home_score: number | null
          id: string
          kickoff_at: string | null
          match_date: string | null
          matchday: number | null
          round_name: string | null
          season_id: string | null
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_club_id?: string | null
          away_score?: number | null
          competition_id?: string | null
          created_at?: string
          home_club_id?: string | null
          home_score?: number | null
          id?: string
          kickoff_at?: string | null
          match_date?: string | null
          matchday?: number | null
          round_name?: string | null
          season_id?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_club_id?: string | null
          away_score?: number | null
          competition_id?: string | null
          created_at?: string
          home_club_id?: string | null
          home_score?: number | null
          id?: string
          kickoff_at?: string | null
          match_date?: string | null
          matchday?: number | null
          round_name?: string | null
          season_id?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "matches_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["gbm_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["gbm_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["gbm_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      player_aliases: {
        Row: {
          alias: string
          alias_type: string
          created_at: string
          id: string
          normalized_alias: string | null
          player_id: string
          source_provider: string | null
        }
        Insert: {
          alias: string
          alias_type?: string
          created_at?: string
          id?: string
          normalized_alias?: string | null
          player_id: string
          source_provider?: string | null
        }
        Update: {
          alias?: string
          alias_type?: string
          created_at?: string
          id?: string
          normalized_alias?: string | null
          player_id?: string
          source_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_aliases_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_aliases_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_aliases_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_aliases_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_aliases_source_provider_fkey"
            columns: ["source_provider"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      player_events: {
        Row: {
          created_at: string
          detail: string | null
          detected_at: string
          event_type: string
          id: string
          new_value: Json | null
          occurred_at: string
          player_id: string
          previous_value: Json | null
          provider_code: string | null
          severity: number
          title: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          detected_at?: string
          event_type: string
          id?: string
          new_value?: Json | null
          occurred_at?: string
          player_id: string
          previous_value?: Json | null
          provider_code?: string | null
          severity?: number
          title: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          detected_at?: string
          event_type?: string
          id?: string
          new_value?: Json | null
          occurred_at?: string
          player_id?: string
          previous_value?: Json | null
          provider_code?: string | null
          severity?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_events_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      player_external_ids: {
        Row: {
          confidence: number
          created_at: string
          external_id: string
          id: string
          match_method: string | null
          namespace: string | null
          player_id: string
          provider_code: string
          updated_at: string
          url: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          external_id: string
          id?: string
          match_method?: string | null
          namespace?: string | null
          player_id: string
          provider_code: string
          updated_at?: string
          url?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          external_id?: string
          id?: string
          match_method?: string | null
          namespace?: string | null
          player_id?: string
          provider_code?: string
          updated_at?: string
          url?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_external_ids_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_external_ids_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_external_ids_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_external_ids_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_external_ids_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      player_guardians: {
        Row: {
          consent_on_file: boolean
          consent_reference: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          guardian_name: string
          id: string
          notes: string | null
          player_id: string
          relationship: string | null
          updated_at: string
        }
        Insert: {
          consent_on_file?: boolean
          consent_reference?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          guardian_name: string
          id?: string
          notes?: string | null
          player_id: string
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          consent_on_file?: boolean
          consent_reference?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          guardian_name?: string
          id?: string
          notes?: string | null
          player_id?: string
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_guardians_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_guardians_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_guardians_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_guardians_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_injuries: {
        Row: {
          created_at: string
          description: string | null
          ended_on: string | null
          expected_return_on: string | null
          games_missed: number | null
          id: string
          injury_type: string | null
          player_id: string
          provider_code: string
          retrieved_at: string
          started_on: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          ended_on?: string | null
          expected_return_on?: string | null
          games_missed?: number | null
          id?: string
          injury_type?: string | null
          player_id: string
          provider_code: string
          retrieved_at?: string
          started_on?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          ended_on?: string | null
          expected_return_on?: string | null
          games_missed?: number | null
          id?: string
          injury_type?: string | null
          player_id?: string
          provider_code?: string
          retrieved_at?: string
          started_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_injuries_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      player_links: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          kind: string
          label: string | null
          player_id: string
          url: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          player_id: string
          url: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          player_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_live_status: {
        Row: {
          availability: string | null
          check_count: number
          last_checked_at: string | null
          latest_assists: number | null
          latest_goals: number | null
          latest_match_at: string | null
          latest_match_id: string | null
          latest_minutes: number | null
          latest_opponent: string | null
          latest_result: string | null
          latest_started: boolean | null
          next_check_after: string | null
          next_match_at: string | null
          next_opponent: string | null
          player_id: string
          source: string | null
          squad_status: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          check_count?: number
          last_checked_at?: string | null
          latest_assists?: number | null
          latest_goals?: number | null
          latest_match_at?: string | null
          latest_match_id?: string | null
          latest_minutes?: number | null
          latest_opponent?: string | null
          latest_result?: string | null
          latest_started?: boolean | null
          next_check_after?: string | null
          next_match_at?: string | null
          next_opponent?: string | null
          player_id: string
          source?: string | null
          squad_status?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          check_count?: number
          last_checked_at?: string | null
          latest_assists?: number | null
          latest_goals?: number | null
          latest_match_at?: string | null
          latest_match_id?: string | null
          latest_minutes?: number | null
          latest_opponent?: string | null
          latest_result?: string | null
          latest_started?: boolean | null
          next_check_after?: string | null
          next_match_at?: string | null
          next_opponent?: string | null
          player_id?: string
          source?: string | null
          squad_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_live_status_latest_match_id_fkey"
            columns: ["latest_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_live_status_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_live_status_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_live_status_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_live_status_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          advanced: Json
          assists: number | null
          club_id: string | null
          created_at: string
          goals: number | null
          id: string
          match_id: string | null
          minutes_played: number | null
          player_id: string
          position_played: string | null
          provider_code: string
          rating: number | null
          red_cards: number | null
          retrieved_at: string
          started: boolean | null
          yellow_cards: number | null
        }
        Insert: {
          advanced?: Json
          assists?: number | null
          club_id?: string | null
          created_at?: string
          goals?: number | null
          id?: string
          match_id?: string | null
          minutes_played?: number | null
          player_id: string
          position_played?: string | null
          provider_code: string
          rating?: number | null
          red_cards?: number | null
          retrieved_at?: string
          started?: boolean | null
          yellow_cards?: number | null
        }
        Update: {
          advanced?: Json
          assists?: number | null
          club_id?: string | null
          created_at?: string
          goals?: number | null
          id?: string
          match_id?: string | null
          minutes_played?: number | null
          player_id?: string
          position_played?: string | null
          provider_code?: string
          rating?: number | null
          red_cards?: number | null
          retrieved_at?: string
          started?: boolean | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_match_stats_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      player_national_team_records: {
        Row: {
          caps: number | null
          country_id: string | null
          created_at: string
          debut_on: string | null
          goals: number | null
          id: string
          last_call_up_on: string | null
          level: string | null
          player_id: string
          provider_code: string
          retrieved_at: string
          team_name: string | null
        }
        Insert: {
          caps?: number | null
          country_id?: string | null
          created_at?: string
          debut_on?: string | null
          goals?: number | null
          id?: string
          last_call_up_on?: string | null
          level?: string | null
          player_id: string
          provider_code: string
          retrieved_at?: string
          team_name?: string | null
        }
        Update: {
          caps?: number | null
          country_id?: string | null
          created_at?: string
          debut_on?: string | null
          goals?: number | null
          id?: string
          last_call_up_on?: string | null
          level?: string | null
          player_id?: string
          provider_code?: string
          retrieved_at?: string
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_national_team_records_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_national_team_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_national_team_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_national_team_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_national_team_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_national_team_records_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      player_news: {
        Row: {
          agent_id: string | null
          category: string | null
          confidence: number | null
          content_hash: string
          discovered_at: string
          headline: string
          id: string
          impact: string | null
          impact_note: string | null
          language: string | null
          player_id: string
          published_at: string | null
          reliability: number | null
          source_name: string
          source_type: string
          source_url: string | null
          summary: string | null
        }
        Insert: {
          agent_id?: string | null
          category?: string | null
          confidence?: number | null
          content_hash: string
          discovered_at?: string
          headline: string
          id?: string
          impact?: string | null
          impact_note?: string | null
          language?: string | null
          player_id: string
          published_at?: string | null
          reliability?: number | null
          source_name: string
          source_type: string
          source_url?: string | null
          summary?: string | null
        }
        Update: {
          agent_id?: string | null
          category?: string | null
          confidence?: number | null
          content_hash?: string
          discovered_at?: string
          headline?: string
          id?: string
          impact?: string | null
          impact_note?: string | null
          language?: string | null
          player_id?: string
          published_at?: string | null
          reliability?: number | null
          source_name?: string
          source_type?: string
          source_url?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_news_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "intel_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_news_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_news_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_news_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_news_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_private: boolean
          player_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_private?: boolean
          player_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_private?: boolean
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_percentiles: {
        Row: {
          computed_at: string
          id: string
          metric_key: string
          peer_group: string
          peer_group_size: number | null
          per90_value: number | null
          percentile: number | null
          player_id: string
          raw_value: number | null
          season_id: string | null
        }
        Insert: {
          computed_at?: string
          id?: string
          metric_key: string
          peer_group: string
          peer_group_size?: number | null
          per90_value?: number | null
          percentile?: number | null
          player_id: string
          raw_value?: number | null
          season_id?: string | null
        }
        Update: {
          computed_at?: string
          id?: string
          metric_key?: string
          peer_group?: string
          peer_group_size?: number | null
          per90_value?: number | null
          percentile?: number | null
          player_id?: string
          raw_value?: number | null
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_percentiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_percentiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_percentiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_percentiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_percentiles_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_rankings: {
        Row: {
          computed_at: string
          id: string
          player_id: string
          rank: number
          ranking_key: string
          scope: string | null
          season_id: string | null
          value: number | null
        }
        Insert: {
          computed_at?: string
          id?: string
          player_id: string
          rank: number
          ranking_key: string
          scope?: string | null
          season_id?: string | null
          value?: number | null
        }
        Update: {
          computed_at?: string
          id?: string
          player_id?: string
          rank?: number
          ranking_key?: string
          scope?: string | null
          season_id?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_rankings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_season_stats: {
        Row: {
          advanced: Json
          aerial_duels: number | null
          aerial_duels_won: number | null
          assists: number | null
          clean_sheets: number | null
          clearances: number | null
          club_id: string | null
          competition_id: string | null
          created_at: string
          dribbles: number | null
          dribbles_successful: number | null
          duels: number | null
          duels_won: number | null
          goals: number | null
          goals_conceded: number | null
          id: string
          interceptions: number | null
          key_passes: number | null
          matches_played: number | null
          matches_started: number | null
          minutes_played: number | null
          passes: number | null
          passes_accurate: number | null
          player_id: string
          progressive_carries: number | null
          progressive_passes: number | null
          provider_code: string
          red_cards: number | null
          retrieved_at: string
          saves: number | null
          season_id: string | null
          shots: number | null
          shots_on_target: number | null
          tackles: number | null
          touches_in_box: number | null
          updated_at: string
          xa: number | null
          xg: number | null
          yellow_cards: number | null
        }
        Insert: {
          advanced?: Json
          aerial_duels?: number | null
          aerial_duels_won?: number | null
          assists?: number | null
          clean_sheets?: number | null
          clearances?: number | null
          club_id?: string | null
          competition_id?: string | null
          created_at?: string
          dribbles?: number | null
          dribbles_successful?: number | null
          duels?: number | null
          duels_won?: number | null
          goals?: number | null
          goals_conceded?: number | null
          id?: string
          interceptions?: number | null
          key_passes?: number | null
          matches_played?: number | null
          matches_started?: number | null
          minutes_played?: number | null
          passes?: number | null
          passes_accurate?: number | null
          player_id: string
          progressive_carries?: number | null
          progressive_passes?: number | null
          provider_code: string
          red_cards?: number | null
          retrieved_at?: string
          saves?: number | null
          season_id?: string | null
          shots?: number | null
          shots_on_target?: number | null
          tackles?: number | null
          touches_in_box?: number | null
          updated_at?: string
          xa?: number | null
          xg?: number | null
          yellow_cards?: number | null
        }
        Update: {
          advanced?: Json
          aerial_duels?: number | null
          aerial_duels_won?: number | null
          assists?: number | null
          clean_sheets?: number | null
          clearances?: number | null
          club_id?: string | null
          competition_id?: string | null
          created_at?: string
          dribbles?: number | null
          dribbles_successful?: number | null
          duels?: number | null
          duels_won?: number | null
          goals?: number | null
          goals_conceded?: number | null
          id?: string
          interceptions?: number | null
          key_passes?: number | null
          matches_played?: number | null
          matches_started?: number | null
          minutes_played?: number | null
          passes?: number | null
          passes_accurate?: number | null
          player_id?: string
          progressive_carries?: number | null
          progressive_passes?: number | null
          provider_code?: string
          red_cards?: number | null
          retrieved_at?: string
          saves?: number | null
          season_id?: string | null
          shots?: number | null
          shots_on_target?: number | null
          tackles?: number | null
          touches_in_box?: number | null
          updated_at?: string
          xa?: number | null
          xg?: number | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_season_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_season_stats_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_season_stats_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "player_season_stats_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_season_stats_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "player_season_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_tags: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          player_id: string
          tag_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          player_id: string
          tag_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          player_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_tags_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tags_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tags_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_tags_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_tags_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      player_team_history: {
        Row: {
          club_id: string | null
          club_name_raw: string | null
          competition_id: string | null
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          is_loan: boolean
          player_id: string
          season_id: string | null
          shirt_number: number | null
          source_provider: string | null
          start_date: string | null
        }
        Insert: {
          club_id?: string | null
          club_name_raw?: string | null
          competition_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          is_loan?: boolean
          player_id: string
          season_id?: string | null
          shirt_number?: number | null
          source_provider?: string | null
          start_date?: string | null
        }
        Update: {
          club_id?: string | null
          club_name_raw?: string | null
          competition_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          is_loan?: boolean
          player_id?: string
          season_id?: string | null
          shirt_number?: number | null
          source_provider?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_team_history_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_history_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_history_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "player_team_history_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "player_team_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_team_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_team_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_team_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_history_source_provider_fkey"
            columns: ["source_provider"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      players: {
        Row: {
          birth_country_id: string | null
          birth_place: string | null
          cached_contract_expires: string | null
          cached_league: string | null
          cached_market_value: number | null
          cached_opportunity: number | null
          cached_season_minutes: number | null
          cached_value_change_pct: number | null
          caches_refreshed_at: string | null
          created_at: string
          current_club_id: string | null
          data_confidence: number
          date_of_birth: string | null
          first_name: string | null
          foot: Database["public"]["Enums"]["preferred_foot"]
          full_name: string
          gbm_hero_image_url: string | null
          gbm_portrait_url: string | null
          gbm_status: string
          height_cm: number | null
          id: string
          image_credit: string | null
          image_url: string | null
          is_goalkeeper: boolean
          is_retired: boolean
          last_enriched_at: string | null
          last_name: string | null
          nationality_country_id: string | null
          normalized_name: string | null
          primary_position: string | null
          second_nationality_country_id: string | null
          secondary_positions: string[]
          shirt_number: number | null
          short_name: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          birth_country_id?: string | null
          birth_place?: string | null
          cached_contract_expires?: string | null
          cached_league?: string | null
          cached_market_value?: number | null
          cached_opportunity?: number | null
          cached_season_minutes?: number | null
          cached_value_change_pct?: number | null
          caches_refreshed_at?: string | null
          created_at?: string
          current_club_id?: string | null
          data_confidence?: number
          date_of_birth?: string | null
          first_name?: string | null
          foot?: Database["public"]["Enums"]["preferred_foot"]
          full_name: string
          gbm_hero_image_url?: string | null
          gbm_portrait_url?: string | null
          gbm_status?: string
          height_cm?: number | null
          id?: string
          image_credit?: string | null
          image_url?: string | null
          is_goalkeeper?: boolean
          is_retired?: boolean
          last_enriched_at?: string | null
          last_name?: string | null
          nationality_country_id?: string | null
          normalized_name?: string | null
          primary_position?: string | null
          second_nationality_country_id?: string | null
          secondary_positions?: string[]
          shirt_number?: number | null
          short_name?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          birth_country_id?: string | null
          birth_place?: string | null
          cached_contract_expires?: string | null
          cached_league?: string | null
          cached_market_value?: number | null
          cached_opportunity?: number | null
          cached_season_minutes?: number | null
          cached_value_change_pct?: number | null
          caches_refreshed_at?: string | null
          created_at?: string
          current_club_id?: string | null
          data_confidence?: number
          date_of_birth?: string | null
          first_name?: string | null
          foot?: Database["public"]["Enums"]["preferred_foot"]
          full_name?: string
          gbm_hero_image_url?: string | null
          gbm_portrait_url?: string | null
          gbm_status?: string
          height_cm?: number | null
          id?: string
          image_credit?: string | null
          image_url?: string | null
          is_goalkeeper?: boolean
          is_retired?: boolean
          last_enriched_at?: string | null
          last_name?: string | null
          nationality_country_id?: string | null
          normalized_name?: string | null
          primary_position?: string | null
          second_nationality_country_id?: string | null
          secondary_positions?: string[]
          shirt_number?: number | null
          short_name?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_birth_country_id_fkey"
            columns: ["birth_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_current_club_id_fkey"
            columns: ["current_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_nationality_country_id_fkey"
            columns: ["nationality_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_second_nationality_country_id_fkey"
            columns: ["second_nationality_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_fact_priority: {
        Row: {
          fact_key: string
          priority: number
          provider_code: string
        }
        Insert: {
          fact_key: string
          priority: number
          provider_code: string
        }
        Update: {
          fact_key?: string
          priority?: number
          provider_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_fact_priority_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      representation_records: {
        Row: {
          agency_name: string | null
          agency_name_normalized: string | null
          agent_name: string | null
          created_at: string
          id: string
          is_current: boolean
          player_id: string
          provider_code: string
          retrieved_at: string
          source_url: string | null
          status: Database["public"]["Enums"]["representation_status"]
        }
        Insert: {
          agency_name?: string | null
          agency_name_normalized?: string | null
          agent_name?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          player_id: string
          provider_code: string
          retrieved_at?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["representation_status"]
        }
        Update: {
          agency_name?: string | null
          agency_name_normalized?: string | null
          agent_name?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          player_id?: string
          provider_code?: string
          retrieved_at?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["representation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "representation_records_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      scout_player_ratings: {
        Row: {
          attribute: string
          created_at: string
          id: string
          player_id: string
          rating: number
          scout_id: string | null
        }
        Insert: {
          attribute: string
          created_at?: string
          id?: string
          player_id: string
          rating: number
          scout_id?: string | null
        }
        Update: {
          attribute?: string
          created_at?: string
          id?: string
          player_id?: string
          rating?: number
          scout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "scout_player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "scout_player_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "scout_player_ratings_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scouting_report_sections: {
        Row: {
          body: string | null
          heading: string
          id: string
          report_id: string
          sort_order: number
        }
        Insert: {
          body?: string | null
          heading: string
          id?: string
          report_id: string
          sort_order?: number
        }
        Update: {
          body?: string | null
          heading?: string
          id?: string
          report_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "scouting_report_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "scouting_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      scouting_reports: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          is_draft: boolean
          match_id: string | null
          mental: number | null
          minutes_observed: number | null
          observed_live: boolean
          observed_on: string | null
          opposition: string | null
          overall_rating: number | null
          physical: number | null
          player_id: string
          position_observed: string | null
          potential_rating: number | null
          recommendation: Database["public"]["Enums"]["recommendation"]
          scout_id: string | null
          strengths: string | null
          summary: string | null
          tactical: number | null
          technical: number | null
          updated_at: string
          weaknesses: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_draft?: boolean
          match_id?: string | null
          mental?: number | null
          minutes_observed?: number | null
          observed_live?: boolean
          observed_on?: string | null
          opposition?: string | null
          overall_rating?: number | null
          physical?: number | null
          player_id: string
          position_observed?: string | null
          potential_rating?: number | null
          recommendation?: Database["public"]["Enums"]["recommendation"]
          scout_id?: string | null
          strengths?: string | null
          summary?: string | null
          tactical?: number | null
          technical?: number | null
          updated_at?: string
          weaknesses?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_draft?: boolean
          match_id?: string | null
          mental?: number | null
          minutes_observed?: number | null
          observed_live?: boolean
          observed_on?: string | null
          opposition?: string | null
          overall_rating?: number | null
          physical?: number | null
          player_id?: string
          position_observed?: string | null
          potential_rating?: number | null
          recommendation?: Database["public"]["Enums"]["recommendation"]
          scout_id?: string | null
          strengths?: string | null
          summary?: string | null
          tactical?: number | null
          technical?: number | null
          updated_at?: string
          weaknesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scouting_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "scouting_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "scouting_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "scouting_reports_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_external_ids: {
        Row: {
          confidence: number
          created_at: string
          external_id: string
          id: string
          namespace: string | null
          provider_code: string
          season_id: string
          url: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          external_id: string
          id?: string
          namespace?: string | null
          provider_code: string
          season_id: string
          url?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          external_id?: string
          id?: string
          namespace?: string | null
          provider_code?: string
          season_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_external_ids_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "season_external_ids_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          competition_id: string
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          name: string
          start_date: string | null
        }
        Insert: {
          competition_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name: string
          start_date?: string | null
        }
        Update: {
          competition_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_league_options"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["league_id"]
          },
        ]
      }
      source_facts: {
        Row: {
          confidence: number
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          fact_key: string
          id: string
          is_current: boolean
          provider_code: string
          retrieved_at: string
          source_record_id: string | null
          source_url: string | null
          state: Database["public"]["Enums"]["fact_state"]
          value_date: string | null
          value_json: Json | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          fact_key: string
          id?: string
          is_current?: boolean
          provider_code: string
          retrieved_at?: string
          source_record_id?: string | null
          source_url?: string | null
          state?: Database["public"]["Enums"]["fact_state"]
          value_date?: string | null
          value_json?: Json | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          fact_key?: string
          id?: string
          is_current?: boolean
          provider_code?: string
          retrieved_at?: string
          source_record_id?: string | null
          source_url?: string | null
          state?: Database["public"]["Enums"]["fact_state"]
          value_date?: string | null
          value_json?: Json | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_facts_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "source_facts_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      source_records: {
        Row: {
          club_id: string | null
          collected_by: string | null
          created_at: string
          external_id: string
          id: string
          namespace: string | null
          payload: Json
          payload_hash: string
          player_id: string | null
          provider_code: string
          resource_type: string
          retrieved_at: string
          schema_version: number
          source_url: string | null
        }
        Insert: {
          club_id?: string | null
          collected_by?: string | null
          created_at?: string
          external_id: string
          id?: string
          namespace?: string | null
          payload: Json
          payload_hash: string
          player_id?: string | null
          provider_code: string
          resource_type: string
          retrieved_at?: string
          schema_version?: number
          source_url?: string | null
        }
        Update: {
          club_id?: string | null
          collected_by?: string | null
          created_at?: string
          external_id?: string
          id?: string
          namespace?: string | null
          payload?: Json
          payload_hash?: string
          player_id?: string | null
          provider_code?: string
          resource_type?: string
          retrieved_at?: string
          schema_version?: number
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_records_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_records_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "source_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "source_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "source_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "source_records_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          label: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          created_at: string
          fee_amount: number | null
          fee_currency: string | null
          from_club_id: string | null
          from_club_name_raw: string | null
          id: string
          is_free: boolean
          is_loan: boolean
          market_value_at_transfer: number | null
          player_id: string
          provider_code: string
          retrieved_at: string
          season_name: string | null
          source_url: string | null
          to_club_id: string | null
          to_club_name_raw: string | null
          transfer_date: string | null
          transfer_type: string | null
        }
        Insert: {
          created_at?: string
          fee_amount?: number | null
          fee_currency?: string | null
          from_club_id?: string | null
          from_club_name_raw?: string | null
          id?: string
          is_free?: boolean
          is_loan?: boolean
          market_value_at_transfer?: number | null
          player_id: string
          provider_code: string
          retrieved_at?: string
          season_name?: string | null
          source_url?: string | null
          to_club_id?: string | null
          to_club_name_raw?: string | null
          transfer_date?: string | null
          transfer_type?: string | null
        }
        Update: {
          created_at?: string
          fee_amount?: number | null
          fee_currency?: string | null
          from_club_id?: string | null
          from_club_name_raw?: string | null
          id?: string
          is_free?: boolean
          is_loan?: boolean
          market_value_at_transfer?: number | null
          player_id?: string
          provider_code?: string
          retrieved_at?: string
          season_name?: string | null
          source_url?: string | null
          to_club_id?: string | null
          to_club_name_raw?: string | null
          transfer_date?: string | null
          transfer_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_club_id_fkey"
            columns: ["from_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "transfers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "transfers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "transfers_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transfers_to_club_id_fkey"
            columns: ["to_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_players: {
        Row: {
          added_at: string
          added_by: string | null
          assigned_scout_id: string | null
          id: string
          player_id: string
          priority: number
          reason: string | null
          status: Database["public"]["Enums"]["watchlist_status"]
          updated_at: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          assigned_scout_id?: string | null
          id?: string
          player_id: string
          priority?: number
          reason?: string | null
          status?: Database["public"]["Enums"]["watchlist_status"]
          updated_at?: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          assigned_scout_id?: string | null
          id?: string
          player_id?: string
          priority?: number
          reason?: string | null
          status?: Database["public"]["Enums"]["watchlist_status"]
          updated_at?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_players_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_players_assigned_scout_id_fkey"
            columns: ["assigned_scout_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "watchlist_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "watchlist_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "watchlist_players_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_shared: boolean
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      player_fact_conflicts: {
        Row: {
          distinct_values: number | null
          fact_key: string | null
          player_id: string | null
          source_count: number | null
          sources: Json | null
        }
        Relationships: []
      }
      v_gbm_portfolio: {
        Row: {
          age: number | null
          assigned_staff_id: string | null
          assigned_staff_name: string | null
          availability: string | null
          caches_refreshed_at: string | null
          club_name: string | null
          contract_expires_on: string | null
          contract_months_remaining: number | null
          date_of_birth: string | null
          foot: Database["public"]["Enums"]["preferred_foot"] | null
          full_name: string | null
          height_cm: number | null
          hero_image_url: string | null
          is_minor: boolean | null
          last_checked_at: string | null
          latest_assists: number | null
          latest_goals: number | null
          latest_match_at: string | null
          latest_minutes: number | null
          latest_opponent: string | null
          latest_result: string | null
          league_name: string | null
          market_value: number | null
          nationality: string | null
          news_last_7d: number | null
          next_match_at: string | null
          next_opponent: string | null
          notes: string | null
          player_id: string | null
          portrait_url: string | null
          primary_position: string | null
          representation_end: string | null
          representation_start: string | null
          status: Database["public"]["Enums"]["gbm_portfolio_status"] | null
          value_change_12m_pct: number | null
          verification_note: string | null
          verified_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "gbm_portfolio_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      v_league_options: {
        Row: {
          league_id: string | null
          league_name: string | null
        }
        Insert: {
          league_id?: string | null
          league_name?: string | null
        }
        Update: {
          league_id?: string | null
          league_name?: string | null
        }
        Relationships: []
      }
      v_player_current_value: {
        Row: {
          currency: string | null
          player_id: string | null
          provider_code: string | null
          value_amount: number | null
          valued_on: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      v_player_discovery: {
        Row: {
          added_at: string | null
          age: number | null
          agency_name: string | null
          assists_per90: number | null
          club_name: string | null
          contract_expires_on: string | null
          contract_months_remaining: number | null
          current_club_id: string | null
          date_of_birth: string | null
          foot: Database["public"]["Enums"]["preferred_foot"] | null
          full_name: string | null
          gbm_opportunity: number | null
          gbm_status: string | null
          goals_per90: number | null
          height_cm: number | null
          image_url: string | null
          league_id: string | null
          league_name: string | null
          market_value: number | null
          nationality: string | null
          nationality_country_id: string | null
          player_id: string | null
          primary_position: string | null
          representation_status: string | null
          season_apps: number | null
          season_assists: number | null
          season_goals: number | null
          season_minutes: number | null
          season_name: string | null
          top_signal_score: number | null
          top_signal_type: string | null
          value_change_12m_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_current_club_id_fkey"
            columns: ["current_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_nationality_country_id_fkey"
            columns: ["nationality_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      v_player_representation: {
        Row: {
          agency_name: string | null
          last_checked_at: string | null
          player_id: string | null
          primary_provider: string | null
          source_count: number | null
          source_url: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "representation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      v_player_source_coverage: {
        Row: {
          has_fotmob: boolean | null
          has_reep: boolean | null
          has_sofascore: boolean | null
          has_transfermarkt: boolean | null
          has_wyscout: boolean | null
          player_id: string | null
          provider_count: number | null
          providers: string[] | null
        }
        Relationships: []
      }
      v_player_value_trend: {
        Row: {
          change_12m_pct: number | null
          current_value: number | null
          data_points: number | null
          first_valued_on: string | null
          last_valued_on: string | null
          pct_of_peak: number | null
          peak_value: number | null
          player_id: string | null
          value_12m_ago: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_discovery"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_source_coverage"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "market_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_representation_opportunities"
            referencedColumns: ["player_id"]
          },
        ]
      }
      v_position_options: {
        Row: {
          position_name: string | null
        }
        Relationships: []
      }
      v_representation_opportunities: {
        Row: {
          age: number | null
          agency_name: string | null
          club_name: string | null
          contract_expires_on: string | null
          contract_months_remaining: number | null
          date_of_birth: string | null
          foot: Database["public"]["Enums"]["preferred_foot"] | null
          full_name: string | null
          gbm_status: string | null
          height_cm: number | null
          image_url: string | null
          market_value: number | null
          nationality: string | null
          player_id: string | null
          primary_position: string | null
          representation_checked_at: string | null
          representation_source_url: string | null
          representation_status: string | null
          transfermarkt_url: string | null
          value_change_12m_pct: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      gbm_can_manage_portfolio: { Args: never; Returns: boolean }
      gbm_can_manage_staff: { Args: never; Returns: boolean }
      gbm_can_view_guardian_data: { Args: never; Returns: boolean }
      gbm_can_write: { Args: never; Returns: boolean }
      gbm_compute_discovery_signals: {
        Args: never
        Returns: {
          inserted: number
          signal_type: string
        }[]
      }
      gbm_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["gbm_role"]
      }
      gbm_intel_current_agent: { Args: never; Returns: string }
      gbm_intel_resolve_player: {
        Args: { p_date_of_birth?: string; p_name: string }
        Returns: {
          club_name: string
          date_of_birth: string
          full_name: string
          match_quality: string
          player_id: string
        }[]
      }
      gbm_intel_submit: { Args: { p_submission: Json }; Returns: Json }
      gbm_is_member: { Args: never; Returns: boolean }
      gbm_normalize_name: { Args: { input: string }; Returns: string }
      gbm_recompute_data_confidence: {
        Args: { player_ids: string[] }
        Returns: undefined
      }
      gbm_refresh_player_caches: { Args: never; Returns: number }
      gbm_role_rank: {
        Args: { r: Database["public"]["Enums"]["gbm_role"] }
        Returns: number
      }
    }
    Enums: {
      competition_gender: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
      competition_tier:
        | "FIRST_TIER"
        | "SECOND_TIER"
        | "THIRD_TIER"
        | "FOURTH_TIER"
        | "LOWER_TIER"
        | "YOUTH"
        | "CUP"
        | "CONTINENTAL"
        | "INTERNATIONAL"
        | "FRIENDLY"
        | "UNKNOWN"
      entity_type:
        | "PLAYER"
        | "CLUB"
        | "COMPETITION"
        | "SEASON"
        | "MATCH"
        | "COACH"
      fact_state:
        | "VERIFIED"
        | "MULTI_SOURCE_VERIFIED"
        | "SOURCE_REPORTED"
        | "DERIVED"
        | "GBM_SCOUT"
        | "CONFLICTING"
        | "UNKNOWN"
        | "AI_ASSESSED"
      gbm_portfolio_status:
        | "REPRESENTED"
        | "IN_DISCUSSION"
        | "FORMER"
        | "REVIEW_QUEUE"
      gbm_role:
        | "OWNER"
        | "ADMIN"
        | "SCOUT"
        | "ANALYST"
        | "VIEWER"
        | "EXECUTIVE_DIRECTOR"
        | "PLAYER_SERVICE_SCOUT"
      preferred_foot: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN"
      recommendation:
        | "SIGN"
        | "MONITOR"
        | "SCOUT_AGAIN"
        | "REPRESENT"
        | "PASS"
        | "UNDECIDED"
      representation_status:
        | "KNOWN_AGENCY"
        | "NO_AGENCY_LISTED"
        | "UNKNOWN"
        | "CONFLICTING"
      watchlist_status:
        | "NEW"
        | "RESEARCH"
        | "WATCHING"
        | "SCOUT"
        | "HIGH_PRIORITY"
        | "CONTACT"
        | "CLUB_TARGET"
        | "REPRESENTATION_TARGET"
        | "PASS"
        | "ARCHIVED"
        | "DISCOVERED"
        | "MONITORING"
        | "SCOUT_REQUESTED"
        | "CONTACTED"
        | "NEGOTIATING"
        | "REJECTED"
        | "REPRESENTED_BY_GBM"
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
      competition_gender: ["MALE", "FEMALE", "MIXED", "UNKNOWN"],
      competition_tier: [
        "FIRST_TIER",
        "SECOND_TIER",
        "THIRD_TIER",
        "FOURTH_TIER",
        "LOWER_TIER",
        "YOUTH",
        "CUP",
        "CONTINENTAL",
        "INTERNATIONAL",
        "FRIENDLY",
        "UNKNOWN",
      ],
      entity_type: [
        "PLAYER",
        "CLUB",
        "COMPETITION",
        "SEASON",
        "MATCH",
        "COACH",
      ],
      fact_state: [
        "VERIFIED",
        "MULTI_SOURCE_VERIFIED",
        "SOURCE_REPORTED",
        "DERIVED",
        "GBM_SCOUT",
        "CONFLICTING",
        "UNKNOWN",
        "AI_ASSESSED",
      ],
      gbm_portfolio_status: [
        "REPRESENTED",
        "IN_DISCUSSION",
        "FORMER",
        "REVIEW_QUEUE",
      ],
      gbm_role: [
        "OWNER",
        "ADMIN",
        "SCOUT",
        "ANALYST",
        "VIEWER",
        "EXECUTIVE_DIRECTOR",
        "PLAYER_SERVICE_SCOUT",
      ],
      preferred_foot: ["LEFT", "RIGHT", "BOTH", "UNKNOWN"],
      recommendation: [
        "SIGN",
        "MONITOR",
        "SCOUT_AGAIN",
        "REPRESENT",
        "PASS",
        "UNDECIDED",
      ],
      representation_status: [
        "KNOWN_AGENCY",
        "NO_AGENCY_LISTED",
        "UNKNOWN",
        "CONFLICTING",
      ],
      watchlist_status: [
        "NEW",
        "RESEARCH",
        "WATCHING",
        "SCOUT",
        "HIGH_PRIORITY",
        "CONTACT",
        "CLUB_TARGET",
        "REPRESENTATION_TARGET",
        "PASS",
        "ARCHIVED",
        "DISCOVERED",
        "MONITORING",
        "SCOUT_REQUESTED",
        "CONTACTED",
        "NEGOTIATING",
        "REJECTED",
        "REPRESENTED_BY_GBM",
      ],
    },
  },
} as const
