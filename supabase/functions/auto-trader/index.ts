import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MT5_API_URL = "https://mt5.mtapi.io";
const REQUEST_TIMEOUT_MS = 10000;
const CONNECT_TIMEOUT_MS = 20000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, supabaseServiceKey);

const toNumber = (v: unknown) => Number(v) || 0;

async function mt5Fetch(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return res;
      const errText = await res.text();
      console.error(`mt5Fetch attempt ${attempt} status ${res.status}: ${errText}`);
    } catch (err) {
      clearTimeout(timeoutId);
      console.error(`mt5Fetch attempt ${attempt} error:`, err);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
  }
  throw new Error("MT5 request failed after retries");
}

async function mt5Json(url: string, timeoutMs?: number): Promise<unknown> {
  const res = await mt5Fetch(url, timeoutMs);
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { result: text.trim() }; }
}

async function ensureConnection(session: Record<string, unknown>): Promise<string> {
  const connId = String(session.connection_id || "");
  try {
    const res = await mt5Fetch(
      `${MT5_API_URL}/AccountSummary?id=${encodeURIComponent(connId)}`,
      5000
    );
    const text = await res.text();
    if (text && !text.includes("not found") && !text.includes("error")) {
      return connId;
    }
  } catch { }

  const url = `${MT5_API_URL}/Connect?user=${encodeURIComponent(String(session.credentials_login))}&password=${encodeURIComponent(String(session.credentials_password))}&host=${encodeURIComponent(String(session.credentials_host))}&port=${session.credentials_port || 443}`;
  const res = await mt5Fetch(url, CONNECT_TIMEOUT_MS);
  const newConnId = (await res.text()).trim();
  
  await sb.from("trading_sessions").update({ connection_id: newConnId }).eq("id", session.id);
  return newConnId;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

async function fetchCandles(connId: string, symbol: string, tf: string): Promise<Candle[]> {
  const tfMap: Record<string, number> = {
    "1m": 1, "5m": 5, "15m": 15, "30m": 30,
    "1h": 60, "4h": 240, "1d": 1440,
  };
  const tfInt = tfMap[tf] || 1;
  const data = await mt5Json(
    `${MT5_API_URL}/PriceHistoryToday?id=${encodeURIComponent(connId)}&symbol=${encodeURIComponent(symbol)}&timeFrame=${tfInt}`
  );
  if (!Array.isArray(data)) return [];
  return data.map((c: Record<string, unknown>) => ({
    time: String(c.time || c.Time || c.date || c.Date || ""),
    open: toNumber(c.open ?? c.Open ?? c.openPrice),
    high: toNumber(c.high ?? c.High ?? c.highPrice),
    low: toNumber(c.low ?? c.Low ?? c.lowPrice),
    close: toNumber(c.close ?? c.Close ?? c.closePrice),
  }));
}

function isSyntheticIndex(name: string): boolean {
  return /pain|gain|synthetic|volatility|boom|crash|step|range|jump/i.test(name);
}

function getAutoTradeDirection(symbol: string, spikeDirection: "bullish" | "bearish"): "buy" | "sell" {
  if (/pain/i.test(symbol)) return "buy";
  if (/gain/i.test(symbol)) return "sell";
  return spikeDirection === "bullish" ? "sell" : "buy";
}

function extractIndexNumber(symbol: string): number {
  const match = symbol.match(/(\d{2,})/);
  return match ? parseInt(match[1], 10) : 0;
}

function toMinuteBucket(time: string): string {
  const ts = new Date(time).getTime();
  return Number.isNaN(ts) ? time : String(Math.floor(ts / 60000));
}

function getSessionTimestamp(session: Record<string, unknown>): number {
  const updatedAt = Date.parse(String(session.updated_at || ""));
  if (!Number.isNaN(updatedAt)) return updatedAt;
  const createdAt = Date.parse(String(session.created_at || ""));
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

function getSessionIdentity(session: Record<string, unknown>): string {
  const login = String(session.credentials_login || "").trim();
  const host = String(session.credentials_host || "").trim();
  const connectionId = String(session.connection_id || "").trim();

  if (login && host) return `${login}@${host}`;
  if (connectionId) return `connection:${connectionId}`;
  return `session:${String(session.id || "")}`;
}

async function getAccountInfo(connId: string) {
  const data = mt5Json(`${MT5_API_URL}/AccountSummary?id=${encodeURIComponent(connId)}`);
  const d = (await data) as Record<string, unknown>;
  return {
    balance: toNumber(d.balance),
    equity: toNumber(d.equity),
    margin: toNumber(d.margin),
    freeMargin: toNumber(d.freeMargin),
  };
}

async function getSymbolParams(connId: string, symbol: string) {
  const data = await mt5Json(
    `${MT5_API_URL}/SymbolParams?id=${encodeURIComponent(connId)}&symbol=${encodeURIComponent(symbol)}`
  );
  const d = data as Record<string, unknown>;
  const digits = Math.max(0, toNumber(d.digits ?? d.Digits));
  const tickSize = Number(d.tickSize ?? d.TickSize ?? d.point ?? d.Point) || (digits > 0 ? 1 / 10 ** digits : 0.01);
  const spread = toNumber(d.spread ?? d.Spread);
  return { digits, tickSize, spread };
}

async function getQuote(connId: string, symbol: string) {
  const data = await mt5Json(
    `${MT5_API_URL}/GetQuote?id=${encodeURIComponent(connId)}&symbol=${encodeURIComponent(symbol)}`
  );
  const d = data as Record<string, unknown>;
  return { bid: toNumber(d.bid ?? d.Bid), ask: toNumber(d.ask ?? d.Ask) };
}

async function openTrade(
  connId: string, symbol: string, type: string, volume: number,
  tpPrice?: number, slPrice?: number, entryPrice?: number, slippage?: number
): Promise<{ ticket?: number; error?: string }> {
  const operation = type === "sell" ? "Sell" : "Buy";
  let url = `${MT5_API_URL}/OrderSendSafe?id=${encodeURIComponent(connId)}&symbol=${encodeURIComponent(symbol)}&operation=${encodeURIComponent(operation)}&volume=${encodeURIComponent(String(volume))}`;
  if (entryPrice && entryPrice > 0) url += `&price=${encodeURIComponent(String(entryPrice))}`;
  if (slippage && slippage >= 0) url += `&slippage=${encodeURIComponent(String(Math.round(slippage)))}`;
  if (slPrice && slPrice > 0) url += `&stoploss=${encodeURIComponent(String(slPrice))}`;
  if (tpPrice && tpPrice > 0) url += `&takeprofit=${encodeURIComponent(String(tpPrice))}`;

  const data = await mt5Json(url);
  const d = data as Record<string, unknown>;
  if (d.error) return { error: String(d.error) };

  const ticket = toNumber(d.ticket ?? d.Ticket ?? d.order ?? d.Order ?? d.result);
  return { ticket: ticket > 0 ? ticket : undefined };
}

function computePriceLevel(
  entryPrice: number, type: string, pips: number, tickSize: number, spread: number, direction: "tp" | "sl"
): number {
  const isBuy = type === "buy";
  const minDist = Math.max(tickSize, spread * tickSize);
  const dist = Math.max(pips * tickSize, minDist);
  if (direction === "tp") {
    return isBuy ? entryPrice + dist : entryPrice - dist;
  }
  return isBuy ? entryPrice - dist : entryPrice + dist;
}

async function processSession(session: Record<string, unknown>) {
  const sessionId = String(session.id);
  console.log(`Processing session ${sessionId}`);

  let connId: string;
  try {
    connId = await ensureConnection(session);
  } catch (err) {
    console.error(`Session ${sessionId}: connection failed`, err);
    return;
  }

  const account = await getAccountInfo(connId);

  const autoTradeSymbols = (session.auto_trade_symbols as string[]) || [];
  const excludedSymbols = (session.excluded_symbols as string[]) || [];
  const eligibleSymbols = autoTradeSymbols.filter(s => !excludedSymbols.includes(s)).filter(isSyntheticIndex);

  if (!eligibleSymbols.length) {
    console.log(`Session ${sessionId}: no eligible symbols`);
    return;
  }

  const candleBatches = await Promise.all(
    eligibleSymbols.map(async symbol => ({
      symbol,
      candles: await fetchCandles(connId, symbol, "1m"),
    }))
  );

  const processedKeys = new Set<string>((session.processed_spike_keys as string[]) || []);
  const newSpikes: { symbol: string; direction: "bullish" | "bearish"; percentage: number; key: string }[] = [];

  for (const { symbol, candles } of candleBatches) {
    if (candles.length < 3) continue;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const bodySize = Math.abs(last.close - last.open);
    const prevBody = Math.abs(prev.close - prev.open);
    if (prevBody <= 0 || bodySize <= 0) continue;
    if (bodySize / prevBody < 3) continue;

    const spikeKey = `${symbol}:${toMinuteBucket(last.time)}`;
    if (processedKeys.has(spikeKey)) continue;

    const direction: "bullish" | "bearish" = last.close > last.open ? "bullish" : "bearish";
    const percentage = prev.close !== 0 ? (bodySize / Math.abs(prev.close)) * 100 : 0;
    newSpikes.push({ symbol, direction, percentage, key: spikeKey });
  }

  if (!newSpikes.length) {
    console.log(`Session ${sessionId}: no new spikes`);
    return;
  }

  console.log(`Session ${sessionId}: ${newSpikes.length} spike(s) detected`);

  const sorted = [...newSpikes].sort((a, b) => extractIndexNumber(b.symbol) - extractIndexNumber(a.symbol));
  const chosen = sorted[0];
  const tradeType = getAutoTradeDirection(chosen.symbol, chosen.direction);

  const exitMode = String(session.exit_mode || "pips");
  const lotSize = toNumber(session.lot_size);
  const martingaleEnabled = Boolean(session.martingale_enabled);
  const lotScalingEnabled = Boolean(session.lot_scaling_enabled);
  const currentEffectiveLot = toNumber(session.current_effective_lot) || lotSize;
  const effectiveLot = (martingaleEnabled || lotScalingEnabled) ? currentEffectiveLot : lotSize;

  const quote = await getQuote(connId, chosen.symbol);
  const params = await getSymbolParams(connId, chosen.symbol);
  const entryPrice = tradeType === "buy" ? quote.ask : quote.bid;
  const slippage = Math.max(2, Math.ceil(params.spread || 0));

  let tpPrice: number | undefined;
  let slPrice: number | undefined;

  // Only compute price-based TP/SL in pips mode
  // In candle mode, the server opens trades WITHOUT TP/SL (client handles candle exits)
  if (exitMode === "pips") {
    const tpPips = toNumber(session.take_profit);
    const slPips = toNumber(session.stop_loss);
    if (tpPips > 0) tpPrice = computePriceLevel(entryPrice, tradeType, tpPips, params.tickSize, params.spread, "tp");
    if (slPips > 0) slPrice = computePriceLevel(entryPrice, tradeType, slPips, params.tickSize, params.spread, "sl");
  }

  const useMaxLimit = Boolean(session.use_max_trades_limit);
  const maxTrades = useMaxLimit ? toNumber(session.max_trades_per_spike) : 200;

  // Fire ALL trades concurrently for maximum speed
  const allPromises: Promise<{ success: boolean }>[] = [];

  for (let i = 0; i < maxTrades; i++) {
    allPromises.push((async () => {
      try {
        // In pips mode, refresh quote per trade for accurate stops
        let freshTp = tpPrice;
        let freshSl = slPrice;
        if (exitMode === "pips") {
          const freshQuote = await getQuote(connId, chosen.symbol);
          const freshEntry = tradeType === "buy" ? freshQuote.ask : freshQuote.bid;
          const tpPips = toNumber(session.take_profit);
          const slPips = toNumber(session.stop_loss);
          if (tpPips > 0) freshTp = computePriceLevel(freshEntry, tradeType, tpPips, params.tickSize, params.spread, "tp");
          if (slPips > 0) freshSl = computePriceLevel(freshEntry, tradeType, slPips, params.tickSize, params.spread, "sl");
        }

        const result = await openTrade(connId, chosen.symbol, tradeType, effectiveLot, freshTp, freshSl, entryPrice, slippage);
        if (result.error) {
          console.log(`Trade failed: ${result.error}`);
          return { success: false };
        }
        return { success: true };
      } catch (err) {
        console.error("Trade error:", err);
        return { success: false };
      }
    })());
  }

  const allResults = await Promise.all(allPromises);
  const totalOpened = allResults.filter(r => r.success).length;

  console.log(`Session ${sessionId}: opened ${totalOpened} trades on ${chosen.symbol}`);

  const allKeys = [...processedKeys, ...newSpikes.map(s => s.key)];
  const trimmedKeys = allKeys.slice(-500);

  await sb.from("trading_sessions").update({
    connection_id: connId,
    processed_spike_keys: trimmedKeys,
    last_spike_key: chosen.key,
    
    updated_at: new Date().toISOString(),
  }).eq("id", sessionId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (action === "run" || !action) {
      const { data: sessions, error: dbError } = await sb
        .from("trading_sessions")
        .select("*")
        .eq("is_active", true);

      if (dbError) throw dbError;
      if (!sessions || sessions.length === 0) {
        return new Response(JSON.stringify({ message: "No active sessions" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sortedSessions = [...sessions].sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a));
      const seenIdentities = new Set<string>();
      const uniqueSessions: typeof sortedSessions = [];
      const duplicateIds: string[] = [];

      for (const session of sortedSessions) {
        const identity = getSessionIdentity(session);
        if (seenIdentities.has(identity)) {
          duplicateIds.push(String(session.id));
          continue;
        }

        seenIdentities.add(identity);
        uniqueSessions.push(session);
      }

      if (duplicateIds.length > 0) {
        await sb
          .from("trading_sessions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in("id", duplicateIds);
      }

      const results: { id: string; status: string }[] = [];
      for (const session of uniqueSessions) {
        try {
          await processSession(session);
          results.push({ id: session.id, status: "ok" });
        } catch (err) {
          console.error(`Session ${session.id} failed:`, err);
          results.push({ id: session.id, status: String(err) });
        }
      }

      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "startSession") {
      const { config } = body;
      const now = new Date().toISOString();
      const identityLogin = String(config?.credentials_login || "").trim();
      const identityHost = String(config?.credentials_host || "").trim();
      const identityConnectionId = String(config?.connection_id || "").trim();

      let existingSessionQuery = sb
        .from("trading_sessions")
        .select("*")
        .eq("is_active", true);

      if (identityLogin && identityHost) {
        existingSessionQuery = existingSessionQuery
          .eq("credentials_login", identityLogin)
          .eq("credentials_host", identityHost);
      } else if (identityConnectionId) {
        existingSessionQuery = existingSessionQuery.eq("connection_id", identityConnectionId);
      }

      const { data: existingSessions, error: existingErr } = await existingSessionQuery.order("updated_at", { ascending: false });
      if (existingErr) throw existingErr;

      const [latestSession, ...duplicateSessions] = existingSessions || [];

      if (duplicateSessions.length > 0) {
        await sb
          .from("trading_sessions")
          .update({ is_active: false, updated_at: now })
          .in("id", duplicateSessions.map((session) => session.id));
      }

      if (latestSession) {
        const payload = {
          ...config,
          is_active: true,
          updated_at: now,
        };

        const { data, error: updateErr } = await sb
          .from("trading_sessions")
          .update(payload)
          .eq("id", latestSession.id)
          .select()
          .single();

        if (updateErr) throw updateErr;

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error: insertErr } = await sb
        .from("trading_sessions")
        .insert({ ...config, updated_at: now })
        .select()
        .single();

      if (insertErr) throw insertErr;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "stopSession") {
      const { sessionId } = body;
      await sb.from("trading_sessions").update({ is_active: false }).eq("id", sessionId);
      return new Response(JSON.stringify({ stopped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "updateSession") {
      const { sessionId, config } = body;
      await sb.from("trading_sessions").update({ ...config, updated_at: new Date().toISOString() }).eq("id", sessionId);
      return new Response(JSON.stringify({ updated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "getSession") {
      const { data, error: dbErr } = await sb
        .from("trading_sessions")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dbErr) throw dbErr;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-trader error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
