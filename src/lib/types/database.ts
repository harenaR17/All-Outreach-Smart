export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          label: string | null
          last_used_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          label?: string | null
          last_used_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          label?: string | null
          last_used_at?: string | null
        }
        Relationships: []
      }
      campaign_email_accounts: {
        Row: {
          campaign_id: string
          email_account_id: string
        }
        Insert: {
          campaign_id: string
          email_account_id: string
        }
        Update: {
          campaign_id?: string
          email_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_email_accounts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_email_accounts_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          campaign_id: string
          current_step: number
          email_account_id: string | null
          id: string
          last_message_id: string | null
          lead_id: string
          next_send_at: string | null
          replied_at: string | null
          status: "pending" | "active" | "replied" | "bounced" | "paused" | "completed"
          thread_id: string | null
        }
        Insert: {
          campaign_id: string
          current_step?: number
          email_account_id?: string | null
          id?: string
          last_message_id?: string | null
          lead_id: string
          next_send_at?: string | null
          replied_at?: string | null
          status?: "pending" | "active" | "replied" | "bounced" | "paused" | "completed"
          thread_id?: string | null
        }
        Update: {
          campaign_id?: string
          current_step?: number
          email_account_id?: string | null
          id?: string
          last_message_id?: string | null
          lead_id?: string
          next_send_at?: string | null
          replied_at?: string | null
          status?: "pending" | "active" | "replied" | "bounced" | "paused" | "completed"
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_steps: {
        Row: {
          body_template: string
          campaign_id: string
          delay_days: number
          id: string
          step_order: number
          subject_template: string
        }
        Insert: {
          body_template: string
          campaign_id: string
          delay_days?: number
          id?: string
          step_order: number
          subject_template: string
        }
        Update: {
          body_template?: string
          campaign_id?: string
          delay_days?: number
          id?: string
          step_order?: number
          subject_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          id: string
          name: string
          status: "draft" | "active" | "paused" | "completed"
          timezone: string
          working_days: number[]
          working_hours_end: string
          working_hours_start: string
          stop_on_auto_reply: boolean
          send_priority: "new_leads" | "follow_ups"
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: "draft" | "active" | "paused" | "completed"
          timezone?: string
          working_days?: number[]
          working_hours_end?: string
          working_hours_start?: string
          stop_on_auto_reply?: boolean
          send_priority?: "new_leads" | "follow_ups"
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: "draft" | "active" | "paused" | "completed"
          timezone?: string
          working_days?: number[]
          working_hours_end?: string
          working_hours_start?: string
          stop_on_auto_reply?: boolean
          send_priority?: "new_leads" | "follow_ups"
        }
        Relationships: []
      }
      email_accounts: {
        Row: {
          created_at: string
          daily_send_limit: number
          display_name: string | null
          email_address: string
          error_message: string | null
          first_name: string | null
          google_access_token: string | null
          google_token_expires_at: string | null
          id: string
          is_active: boolean
          last_name: string | null
          last_new_lead_sent_at: string | null
          last_sent_at: string | null
          min_seconds_between_sends: number
          next_available_at: string
          phone_number: string | null
          role: string | null
          service_account_client_email: string
          service_account_private_key: string
          signature: string | null
          status: "active" | "error"
          variables: Record<string, string>
        }
        Insert: {
          created_at?: string
          daily_send_limit?: number
          display_name?: string | null
          email_address: string
          error_message?: string | null
          first_name?: string | null
          google_access_token?: string | null
          google_token_expires_at?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          last_new_lead_sent_at?: string | null
          last_sent_at?: string | null
          min_seconds_between_sends?: number
          next_available_at?: string
          phone_number?: string | null
          role?: string | null
          service_account_client_email: string
          service_account_private_key: string
          signature?: string | null
          status?: "active" | "error"
          variables?: Record<string, string>
        }
        Update: {
          created_at?: string
          daily_send_limit?: number
          display_name?: string | null
          email_address?: string
          error_message?: string | null
          first_name?: string | null
          google_access_token?: string | null
          google_token_expires_at?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          last_new_lead_sent_at?: string | null
          last_sent_at?: string | null
          min_seconds_between_sends?: number
          next_available_at?: string
          phone_number?: string | null
          role?: string | null
          service_account_client_email?: string
          service_account_private_key?: string
          signature?: string | null
          status?: "active" | "error"
          variables?: Record<string, string>
        }
        Relationships: []
      }
      gemini_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Relationships: []
      }
      lead_imports: {
        Row: {
          campaign_id: string | null
          duplicate_leads: number
          filename: string | null
          id: string
          imported_at: string
          new_leads: number
          total_rows: number
        }
        Insert: {
          campaign_id?: string | null
          duplicate_leads?: number
          filename?: string | null
          id?: string
          imported_at?: string
          new_leads?: number
          total_rows?: number
        }
        Update: {
          campaign_id?: string | null
          duplicate_leads?: number
          filename?: string | null
          id?: string
          imported_at?: string
          new_leads?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_imports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string
          id: string
          imported_via: string | null
          status: "active" | "do_not_contact" | "bounced"
          status_changed_at: string | null
          status_reason: string | null
          variables: Record<string, string | number | boolean | null>
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          imported_via?: string | null
          status?: "active" | "do_not_contact" | "bounced"
          status_changed_at?: string | null
          status_reason?: string | null
          variables?: Record<string, string | number | boolean | null>
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          imported_via?: string | null
          status?: "active" | "do_not_contact" | "bounced"
          status_changed_at?: string | null
          status_reason?: string | null
          variables?: Record<string, string | number | boolean | null>
        }
        Relationships: [
          {
            foreignKeyName: "leads_imported_via_fkey"
            columns: ["imported_via"]
            isOneToOne: false
            referencedRelation: "lead_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      replies: {
        Row: {
          campaign_lead_id: string
          classification: "real" | "auto" | "bounce"
          llm_category: "interested" | "not_interested" | "out_of_office" | "wrong_person" | "undefined" | null
          gmail_message_id: string | null
          id: string
          notified_at: string | null
          received_at: string
          snippet: string | null
        }
        Insert: {
          campaign_lead_id: string
          classification: "real" | "auto" | "bounce"
          llm_category?: "interested" | "not_interested" | "out_of_office" | "wrong_person" | "undefined" | null
          gmail_message_id?: string | null
          id?: string
          notified_at?: string | null
          received_at?: string
          snippet?: string | null
        }
        Update: {
          campaign_lead_id?: string
          classification?: "real" | "auto" | "bounce"
          llm_category?: "interested" | "not_interested" | "out_of_office" | "wrong_person" | "undefined" | null
          gmail_message_id?: string | null
          id?: string
          notified_at?: string | null
          received_at?: string
          snippet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replies_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sends: {
        Row: {
          campaign_lead_id: string
          email_account_id: string
          error_message: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          sent_at: string
          status: "sent" | "failed"
          step_id: string
        }
        Insert: {
          campaign_lead_id: string
          email_account_id: string
          error_message?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          sent_at?: string
          status?: "sent" | "failed"
          step_id: string
        }
        Update: {
          campaign_lead_id?: string
          email_account_id?: string
          error_message?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          sent_at?: string
          status?: "sent" | "failed"
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sends_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sends_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sends_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "campaign_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_telegram_recipients: {
        Row: {
          campaign_id: string
          recipient_id: string
        }
        Insert: {
          campaign_id: string
          recipient_id: string
        }
        Update: {
          campaign_id?: string
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_telegram_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_telegram_recipients_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "telegram_notify_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_notify_recipients: {
        Row: {
          bot_token: string
          chat_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
        }
        Insert: {
          bot_token?: string
          chat_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Update: {
          bot_token?: string
          chat_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
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

export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"]
export type CampaignInsert = Database["public"]["Tables"]["campaigns"]["Insert"]
export type CampaignUpdate = Database["public"]["Tables"]["campaigns"]["Update"]

export type EmailAccount = Database["public"]["Tables"]["email_accounts"]["Row"] & {
  sends_today?: number
}
export type EmailAccountInsert = Database["public"]["Tables"]["email_accounts"]["Insert"]
export type EmailAccountUpdate = Database["public"]["Tables"]["email_accounts"]["Update"]

export type Lead = Database["public"]["Tables"]["leads"]["Row"]
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"]
export type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"]

export type CampaignStep = Database["public"]["Tables"]["campaign_steps"]["Row"]
export type CampaignLead = Database["public"]["Tables"]["campaign_leads"]["Row"]
export type Send = Database["public"]["Tables"]["sends"]["Row"]
export type Reply = Database["public"]["Tables"]["replies"]["Row"]
export type GeminiApiKey = Database["public"]["Tables"]["gemini_api_keys"]["Row"]
export type TelegramRecipient = Database["public"]["Tables"]["telegram_notify_recipients"]["Row"]
export type CampaignTelegramRecipient = Database["public"]["Tables"]["campaign_telegram_recipients"]["Row"]
export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"]
export type ApiKeyInsert = Database["public"]["Tables"]["api_keys"]["Insert"]
