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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      trading_sessions: {
        Row: {
          auto_trade_symbols: string[]
          connection_id: string
          created_at: string
          credentials_host: string
          credentials_login: string
          credentials_password: string
          credentials_port: number
          current_effective_lot: number
          daily_closed_pnl: number
          daily_max_loss: number
          daily_max_profit: number
          excluded_symbols: string[]
          exit_mode: string
          id: string
          is_active: boolean
          last_spike_key: string | null
          last_trade_result: string | null
          lot_scaling_enabled: boolean
          lot_scaling_multiplier: number
          lot_size: number
          martingale_enabled: boolean
          martingale_multiplier: number
          max_trades_per_spike: number
          processed_spike_keys: string[]
          sl_candles: number
          starting_balance: number
          stop_loss: number
          take_profit: number
          timeframe: string
          tp_candles: number
          updated_at: string
          use_max_trades_limit: boolean
        }
        Insert: {
          auto_trade_symbols?: string[]
          connection_id: string
          created_at?: string
          credentials_host: string
          credentials_login: string
          credentials_password: string
          credentials_port?: number
          current_effective_lot?: number
          daily_closed_pnl?: number
          daily_max_loss?: number
          daily_max_profit?: number
          excluded_symbols?: string[]
          exit_mode?: string
          id?: string
          is_active?: boolean
          last_spike_key?: string | null
          last_trade_result?: string | null
          lot_scaling_enabled?: boolean
          lot_scaling_multiplier?: number
          lot_size?: number
          martingale_enabled?: boolean
          martingale_multiplier?: number
          max_trades_per_spike?: number
          processed_spike_keys?: string[]
          sl_candles?: number
          starting_balance?: number
          stop_loss?: number
          take_profit?: number
          timeframe?: string
          tp_candles?: number
          updated_at?: string
          use_max_trades_limit?: boolean
        }
        Update: {
          auto_trade_symbols?: string[]
          connection_id?: string
          created_at?: string
          credentials_host?: string
          credentials_login?: string
          credentials_password?: string
          credentials_port?: number
          current_effective_lot?: number
          daily_closed_pnl?: number
          daily_max_loss?: number
          daily_max_profit?: number
          excluded_symbols?: string[]
          exit_mode?: string
          id?: string
          is_active?: boolean
          last_spike_key?: string | null
          last_trade_result?: string | null
          lot_scaling_enabled?: boolean
          lot_scaling_multiplier?: number
          lot_size?: number
          martingale_enabled?: boolean
          martingale_multiplier?: number
          max_trades_per_spike?: number
          processed_spike_keys?: string[]
          sl_candles?: number
          starting_balance?: number
          stop_loss?: number
          take_profit?: number
          timeframe?: string
          tp_candles?: number
          updated_at?: string
          use_max_trades_limit?: boolean
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
