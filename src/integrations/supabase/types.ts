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
      _internal_secrets: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      activity_details: {
        Row: {
          game_key: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          game_key: string
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          game_key?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      apns_subscriptions: {
        Row: {
          app_version: string | null
          bundle_id: string
          created_at: string
          device_name: string | null
          device_token: string
          environment: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          bundle_id?: string
          created_at?: string
          device_name?: string | null
          device_token: string
          environment?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          bundle_id?: string
          created_at?: string
          device_name?: string | null
          device_token?: string
          environment?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      call_events: {
        Row: {
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          state: string
        }
        Insert: {
          caller_id: string
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          state?: string
        }
        Update: {
          caller_id?: string
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_participants: {
        Row: {
          call_event_id: string
          id: string
          is_deafened: boolean
          is_muted: boolean
          is_screen_sharing: boolean
          is_video_on: boolean
          joined_at: string
          last_seen_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          call_event_id: string
          id?: string
          is_deafened?: boolean
          is_muted?: boolean
          is_screen_sharing?: boolean
          is_video_on?: boolean
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          call_event_id?: string
          id?: string
          is_deafened?: boolean
          is_muted?: boolean
          is_screen_sharing?: boolean
          is_video_on?: boolean
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_event_id_fkey"
            columns: ["call_event_id"]
            isOneToOne: false
            referencedRelation: "call_events"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_earning_progress: {
        Row: {
          gaming_seconds_unclaimed: number
          message_count_unclaimed: number
          updated_at: string
          user_id: string
          voice_seconds_unclaimed: number
        }
        Insert: {
          gaming_seconds_unclaimed?: number
          message_count_unclaimed?: number
          updated_at?: string
          user_id: string
          voice_seconds_unclaimed?: number
        }
        Update: {
          gaming_seconds_unclaimed?: number
          message_count_unclaimed?: number
          updated_at?: string
          user_id?: string
          voice_seconds_unclaimed?: number
        }
        Relationships: []
      }
      coin_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          metadata: Json
          reason: string
          source_ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          source_ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          source_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      conversation_mutes: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          muted_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          muted_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          muted_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_mutes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_pins: {
        Row: {
          conversation_id: string
          pinned_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          pinned_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          pinned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_pins_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          is_group: boolean
          name: string | null
          owner_id: string | null
          picture_url: string | null
          server_channel_id: string | null
          server_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_group?: boolean
          name?: string | null
          owner_id?: string | null
          picture_url?: string | null
          server_channel_id?: string | null
          server_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_group?: boolean
          name?: string | null
          owner_id?: string | null
          picture_url?: string | null
          server_channel_id?: string | null
          server_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_server_channel_id_fkey"
            columns: ["server_channel_id"]
            isOneToOne: false
            referencedRelation: "server_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_statuses: {
        Row: {
          emoji: string | null
          expires_at: string | null
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          emoji?: string | null
          expires_at?: string | null
          text?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          emoji?: string | null
          expires_at?: string | null
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dm_preferences: {
        Row: {
          created_at: string
          hidden: boolean
          id: string
          muted: boolean
          muted_until: string | null
          peer_user_id: string
          pinned: boolean
          pinned_at: string | null
          updated_at: string
          user_id: string
          who_can_dm: string
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          id?: string
          muted?: boolean
          muted_until?: string | null
          peer_user_id: string
          pinned?: boolean
          pinned_at?: string | null
          updated_at?: string
          user_id: string
          who_can_dm?: string
        }
        Update: {
          created_at?: string
          hidden?: boolean
          id?: string
          muted?: boolean
          muted_until?: string | null
          peer_user_id?: string
          pinned?: boolean
          pinned_at?: string | null
          updated_at?: string
          user_id?: string
          who_can_dm?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gems_balances: {
        Row: {
          balance: number
          lifetime_earned: number
          lifetime_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gems_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          metadata: Json
          reason: string
          source_ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          source_ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          source_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gif_favorites: {
        Row: {
          created_at: string
          gif_id: string
          gif_preview_url: string
          gif_url: string
          id: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          gif_id: string
          gif_preview_url: string
          gif_url: string
          id?: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          gif_id?: string
          gif_preview_url?: string
          gif_url?: string
          id?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gift_transactions: {
        Row: {
          claimed_at: string | null
          conversation_id: string | null
          created_at: string
          gift_type: string
          id: string
          message: string | null
          message_id: string | null
          payload: Json
          recipient_id: string
          sender_id: string
          status: string
        }
        Insert: {
          claimed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          gift_type: string
          id?: string
          message?: string | null
          message_id?: string | null
          payload?: Json
          recipient_id: string
          sender_id: string
          status?: string
        }
        Update: {
          claimed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          gift_type?: string
          id?: string
          message?: string | null
          message_id?: string | null
          payload?: Json
          recipient_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_transactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      link_previews: {
        Row: {
          description: string | null
          fetched_at: string
          image: string | null
          site_name: string | null
          title: string | null
          url: string
          url_hash: string
        }
        Insert: {
          description?: string | null
          fetched_at?: string
          image?: string | null
          site_name?: string | null
          title?: string | null
          url: string
          url_hash: string
        }
        Update: {
          description?: string | null
          fetched_at?: string
          image?: string | null
          site_name?: string | null
          title?: string | null
          url?: string
          url_hash?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_requests: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          preview: string | null
          recipient_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          preview?: string | null
          recipient_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          preview?: string | null
          recipient_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          note_ref: string | null
          reply_to_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          note_ref?: string | null
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          note_ref?: string | null
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          byte_size: number
          ciphertext: string
          created_at: string
          id: string
          iv: string
          pinned: boolean
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          byte_size?: number
          ciphertext: string
          created_at?: string
          id?: string
          iv: string
          pinned?: boolean
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          byte_size?: number
          ciphertext?: string
          created_at?: string
          id?: string
          iv?: string
          pinned?: boolean
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes_keys: {
        Row: {
          created_at: string
          iterations: number
          kdf: string
          salt: string
          updated_at: string
          user_id: string
          verifier_ciphertext: string
          verifier_iv: string
        }
        Insert: {
          created_at?: string
          iterations?: number
          kdf?: string
          salt: string
          updated_at?: string
          user_id: string
          verifier_ciphertext: string
          verifier_iv: string
        }
        Update: {
          created_at?: string
          iterations?: number
          kdf?: string
          salt?: string
          updated_at?: string
          user_id?: string
          verifier_ciphertext?: string
          verifier_iv?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          last_seen_at: string
          public_wishlist: boolean
          status: string
          updated_at: string
          user_id: string
          username: string
          who_can_dm: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id?: string
          last_seen_at?: string
          public_wishlist?: boolean
          status?: string
          updated_at?: string
          user_id: string
          username: string
          who_can_dm?: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_seen_at?: string
          public_wishlist?: boolean
          status?: string
          updated_at?: string
          user_id?: string
          username?: string
          who_can_dm?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      server_channels: {
        Row: {
          category: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          position: number
          server_id: string
        }
        Insert: {
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name: string
          position?: number
          server_id: string
        }
        Update: {
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          server_id: string
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          server_id: string
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          server_id?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "server_invites_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_member_roles: {
        Row: {
          assigned_at: string
          role_id: string
          server_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          role_id: string
          server_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          role_id?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_member_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "server_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_member_roles_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_members: {
        Row: {
          id: string
          joined_at: string
          role: string
          server_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          server_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_roles: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          server_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          server_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_roles_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          category: string
          config: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          price_gems: number | null
          requires_subscription: string | null
          sort_order: number
          subcategory: string | null
        }
        Insert: {
          category: string
          config?: Json
          created_at?: string
          description?: string | null
          id: string
          is_active?: boolean
          name: string
          price: number
          price_gems?: number | null
          requires_subscription?: string | null
          sort_order?: number
          subcategory?: string | null
        }
        Update: {
          category?: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          price_gems?: number | null
          requires_subscription?: string | null
          sort_order?: number
          subcategory?: string | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          stripe_event_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          stripe_event_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          stripe_event_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          interval: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          interval: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          interval?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activities: {
        Row: {
          activity_type: string
          details: string | null
          name: string | null
          privacy_visible: boolean
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type?: string
          details?: string | null
          name?: string | null
          privacy_visible?: boolean
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          details?: string | null
          name?: string | null
          privacy_visible?: boolean
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_coins: {
        Row: {
          balance: number
          created_at: string
          lifetime_earned: number
          lifetime_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_equipped: {
        Row: {
          category: string
          equipped_at: string
          id: string
          item_id: string
          slot: number
          user_id: string
        }
        Insert: {
          category: string
          equipped_at?: string
          id?: string
          item_id: string
          slot?: number
          user_id: string
        }
        Update: {
          category?: string
          equipped_at?: string
          id?: string
          item_id?: string
          slot?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_equipped_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_games: {
        Row: {
          created_at: string
          display_name: string
          id: string
          process_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          process_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          process_name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_inventory: {
        Row: {
          acquired_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          device_label: string
          id: string
          is_desktop_app: boolean
          is_mobile: boolean
          last_seen_at: string
          platform: string | null
          revoked_at: string | null
          session_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string
          id?: string
          is_desktop_app?: boolean
          is_mobile?: boolean
          last_seen_at?: string
          platform?: string | null
          revoked_at?: string | null
          session_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string
          id?: string
          is_desktop_app?: boolean
          is_mobile?: boolean
          last_seen_at?: string
          platform?: string | null
          revoked_at?: string | null
          session_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _internal_award_coins: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _source_ref?: string
          _user_id: string
        }
        Returns: number
      }
      _internal_credit_gems: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _source_ref?: string
          _user_id: string
        }
        Returns: number
      }
      accept_message_request: { Args: { _request_id: string }; Returns: string }
      accrue_activity_coins: {
        Args: { _gaming_seconds?: number; _voice_seconds?: number }
        Returns: Json
      }
      apply_recipient_note_edit: {
        Args: { _body: string; _message_id: string; _title: string }
        Returns: undefined
      }
      are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      assign_server_role: {
        Args: { _role_id: string; _user_id: string }
        Returns: undefined
      }
      award_coins: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _source_ref?: string
          _user_id: string
        }
        Returns: number
      }
      burn_view_once_note: { Args: { _message_id: string }; Returns: undefined }
      can_access_message: { Args: { _message_id: string }; Returns: boolean }
      claim_gift: { Args: { _gift_id: string }; Returns: Json }
      create_dm_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      create_group_conversation: {
        Args: { _member_ids: string[]; _name: string }
        Returns: string
      }
      create_server: {
        Args: { _icon_url?: string; _name: string }
        Returns: string
      }
      create_server_channel: {
        Args: {
          _category?: string
          _kind?: string
          _name: string
          _server_id: string
        }
        Returns: string
      }
      create_server_from_template: {
        Args: { _channels?: Json; _icon_url?: string; _name: string }
        Returns: string
      }
      create_server_invite: {
        Args: {
          _expires_in_seconds?: number
          _max_uses?: number
          _server_id: string
        }
        Returns: string
      }
      create_server_role: {
        Args: { _color?: string; _name: string; _server_id: string }
        Returns: string
      }
      decline_message_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      delete_server: { Args: { _server_id: string }; Returns: undefined }
      delete_server_channel: {
        Args: { _channel_id: string }
        Returns: undefined
      }
      delete_server_role: { Args: { _role_id: string }; Returns: undefined }
      end_call_event_if_stale: {
        Args: { _call_event_id: string; _stale_seconds?: number }
        Returns: boolean
      }
      equip_shop_item: { Args: { _item_id: string }; Returns: undefined }
      get_internal_secret: { Args: { _name: string }; Returns: string }
      gift_shop_item: {
        Args: {
          _conversation_id?: string
          _item_id: string
          _message?: string
          _recipient_id: string
        }
        Returns: Json
      }
      heartbeat_call_participant: {
        Args: {
          _call_event_id: string
          _is_deafened?: boolean
          _is_muted?: boolean
          _is_screen_sharing?: boolean
          _is_video_on?: boolean
        }
        Returns: undefined
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_server_member: {
        Args: { _server_id: string; _user_id: string }
        Returns: boolean
      }
      is_server_owner: {
        Args: { _server_id: string; _user_id: string }
        Returns: boolean
      }
      join_server_by_code: { Args: { _code: string }; Returns: string }
      kick_server_member: {
        Args: { _server_id: string; _user_id: string }
        Returns: undefined
      }
      lookup_server_invite: { Args: { _code: string }; Returns: Json }
      mark_conversation_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      online_user_ids: {
        Args: { _window_seconds?: number }
        Returns: {
          user_id: string
        }[]
      }
      presence_heartbeat: { Args: { _session_key?: string }; Returns: string }
      purchase_shop_item: { Args: { _item_id: string }; Returns: Json }
      purchase_shop_item_gems: { Args: { _item_id: string }; Returns: Json }
      rename_server_channel: {
        Args: { _channel_id: string; _name: string }
        Returns: undefined
      }
      revoke_server_invite: { Args: { _invite_id: string }; Returns: undefined }
      send_test_bot_reply: {
        Args: { _conversation_id: string }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          note_ref: string | null
          reply_to_id: string | null
          sender_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      share_mutual_friend: {
        Args: { _a: string; _b: string }
        Returns: boolean
      }
      spend_coins: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _source_ref?: string
        }
        Returns: number
      }
      spend_gems: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _source_ref?: string
        }
        Returns: number
      }
      sync_shared_note: {
        Args: { _body: string; _note_id: string; _title: string }
        Returns: number
      }
      transfer_server_ownership: {
        Args: { _new_owner: string; _server_id: string }
        Returns: undefined
      }
      unassign_server_role: {
        Args: { _role_id: string; _user_id: string }
        Returns: undefined
      }
      unequip_shop_item: { Args: { _item_id: string }; Returns: undefined }
      update_server: {
        Args: { _icon_url?: string; _name?: string; _server_id: string }
        Returns: undefined
      }
      update_server_role: {
        Args: { _color?: string; _name?: string; _role_id: string }
        Returns: undefined
      }
      user_subscription_tier: { Args: { _user_id: string }; Returns: string }
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
