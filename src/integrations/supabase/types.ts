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
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          reply_to_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
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
          status: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          username?: string
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
          sort_order?: number
          subcategory?: string | null
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
      accrue_activity_coins: {
        Args: { _gaming_seconds?: number; _voice_seconds?: number }
        Returns: Json
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
      can_access_message: { Args: { _message_id: string }; Returns: boolean }
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
      create_server_invite: {
        Args: {
          _expires_in_seconds?: number
          _max_uses?: number
          _server_id: string
        }
        Returns: string
      }
      end_call_event_if_stale: {
        Args: { _call_event_id: string; _stale_seconds?: number }
        Returns: boolean
      }
      equip_shop_item: { Args: { _item_id: string }; Returns: undefined }
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
      lookup_server_invite: { Args: { _code: string }; Returns: Json }
      mark_conversation_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      purchase_shop_item: { Args: { _item_id: string }; Returns: Json }
      send_test_bot_reply: {
        Args: { _conversation_id: string }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          id: string
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
      spend_coins: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _source_ref?: string
        }
        Returns: number
      }
      unequip_shop_item: { Args: { _item_id: string }; Returns: undefined }
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
