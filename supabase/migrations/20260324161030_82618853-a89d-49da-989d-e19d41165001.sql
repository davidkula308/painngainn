
CREATE TABLE public.trading_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id TEXT NOT NULL,
  credentials_login TEXT NOT NULL,
  credentials_password TEXT NOT NULL,
  credentials_host TEXT NOT NULL,
  credentials_port INTEGER NOT NULL DEFAULT 443,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_trade_symbols TEXT[] NOT NULL DEFAULT '{}',
  excluded_symbols TEXT[] NOT NULL DEFAULT '{}',
  lot_size DOUBLE PRECISION NOT NULL DEFAULT 3,
  exit_mode TEXT NOT NULL DEFAULT 'pips',
  take_profit DOUBLE PRECISION NOT NULL DEFAULT 500,
  stop_loss DOUBLE PRECISION NOT NULL DEFAULT 800,
  tp_candles INTEGER NOT NULL DEFAULT 3,
  sl_candles INTEGER NOT NULL DEFAULT 1,
  timeframe TEXT NOT NULL DEFAULT '1m',
  use_max_trades_limit BOOLEAN NOT NULL DEFAULT false,
  max_trades_per_spike INTEGER NOT NULL DEFAULT 10,
  daily_max_profit DOUBLE PRECISION NOT NULL DEFAULT 100,
  daily_max_loss DOUBLE PRECISION NOT NULL DEFAULT 100,
  martingale_enabled BOOLEAN NOT NULL DEFAULT false,
  martingale_multiplier DOUBLE PRECISION NOT NULL DEFAULT 2,
  lot_scaling_enabled BOOLEAN NOT NULL DEFAULT false,
  lot_scaling_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  starting_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  daily_closed_pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_effective_lot DOUBLE PRECISION NOT NULL DEFAULT 3,
  last_trade_result TEXT,
  last_spike_key TEXT,
  processed_spike_keys TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trading_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to trading_sessions" ON public.trading_sessions
  FOR ALL USING (true) WITH CHECK (true);
