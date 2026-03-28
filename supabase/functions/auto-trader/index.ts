import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MT5_API_URL = "https://mt5.mtapi.io";
const REQUEST_TIMEOUT_MS = 10000;
const CONNECT_TIMEOUT_MS = 20000;
const TRADE_TIMEOUT_MS = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, supabaseServiceKey);

const toNumber = (v: unknown) => Number(v) || 0;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractTicket(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const direct = Number(value.trim());
    if (Number.isFinite(direct)) return direct;

    const matched = value.match(/\b(\d{4,})\b/);
    if (matched) return Number(matched[1]);
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const ticket = extractTicket(item);
      if (ticket) return ticket;
    }
    return undefined;
  }

  const payload = asRecord(value);
  if (!payload) return undefined;

  for (const key of ["ticket", "Ticket", "order", "Order", "orderTicket", "positionId", "deal", "result", "id"]) {
    const ticket = extractTicket(payload[key]);
    if (ticket) return ticket;
  }

  return undefined;
}

function normalizeTradeSide(value: unknown): "Buy" | "Sell" | undefined {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("buy")) return "Buy";
  if (normalized.includes("sell")) return "Sell";
  return undefined;
}

type OpenOrderSnapshot = {
  ticket: number;
  symbol: string;
  lots: number;
  openPrice: number;
  operation: "Buy" | "Sell";
  openedAt?: number;
  stopLoss?: number;
  takeProfit?: number;
};

function normalizeSymbol(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function toOpenOrderSnapshot(order: unknown): OpenOrderSnapshot | null {
  const payload = asRecord(order);
  if (!payload) return null;

  const ticket = extractTicket(payload.ticket ?? payload.Ticket ?? payload.order ?? payload.Order ?? payload.positionId);
  const symbol = String(payload.symbol ?? payload.Symbol ?? "").trim();
  const lots = toFiniteNumber(payload.lots ?? payload.Lots ?? payload.volume ?? payload.Volume);
  const openPrice = toFiniteNumber(payload.openPrice ?? payload.OpenPrice ?? payload.price ?? payload.Price);
  const operation = normalizeTradeSide(payload.type ?? payload.Type ?? payload.operation ?? payload.Operation ?? payload.orderType ?? payload.OrderType);
  const stopLoss = toFiniteNumber(payload.stopLoss ?? payload.StopLoss ?? payload.stoploss ?? payload.sl ?? payload.SL);
  const takeProfit = toFiniteNumber(payload.takeProfit ?? payload.TakeProfit ?? payload.takeprofit ?? payload.tp ?? payload.TP);
  const openedAt = parseTimestamp(
    payload.openTime ?? payload.OpenTime ?? payload.time ?? payload.Time ?? payload.date ?? payload.Date ?? payload.createdAt
  );

  if (!ticket || !symbol || lots === undefined || openPrice === undefined || !operation) {
    return null;
  }

  return { ticket, symbol, lots, openPrice, operation, openedAt, stopLoss, takeProfit };
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-8, Math.abs(b) * 1e-8);
}

function hasExpectedStops(order: OpenOrderSnapshot | null, tp?: number, sl?: number): boolean {
  if (!order) return false;

  const expectsTp = Number.isFinite(tp) && Number(tp) > 0;
  const expectsSl = Number.isFinite(sl) && Number(sl) > 0;
  const tpMatches = !expectsTp || (order.takeProfit !== undefined && approximatelyEqual(order.takeProfit, Number(tp)));
  const slMatches = !expectsSl || (order.stopLoss !== undefined && approximatelyEqual(order.stopLoss, Number(sl)));

  return tpMatches && slMatches;
}

function isTradeFailurePayload(value: unknown): boolean {
  const payload = asRecord(value);
  if (!payload) return false;
  if (payload.error) return true;

  const code = String(payload.code ?? "").toUpperCase();
  const hasTicket = extractTicket(payload) !== undefined;
  if (!code) return false;
  if (["OK", "SUCCESS", "DONE", "PLACED"].includes(code)) return false;

  return !hasTicket;
}

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

async function getOpenedOrderByTicket(connId: string, ticket: number): Promise<OpenOrderSnapshot | null> {
  const data = await mt5Json(
    `${MT5_API_URL}/OpenedOrder?id=${encodeURIComponent(connId)}&ticket=${encodeURIComponent(String(ticket))}`
  );
  return toOpenOrderSnapshot(data);
}

async function findLatestOpenedOrder(
  connId: string,
  symbol: string,
  operation: "Buy" | "Sell",
  volume: number,
  requestedAt?: number,
): Promise<OpenOrderSnapshot | null> {
  const data = await mt5Json(`${MT5_API_URL}/OpenedOrders?id=${encodeURIComponent(connId)}`);
  if (!Array.isArray(data)) return null;

  const targetSymbol = normalizeSymbol(symbol);
  const matched = data
    .map(toOpenOrderSnapshot)
    .filter((order): order is OpenOrderSnapshot => Boolean(order))
    .filter((order) => normalizeSymbol(order.symbol) === targetSymbol && order.operation === operation)
    .sort((a, b) => {
      const aRecency = a.openedAt ?? a.ticket;
      const bRecency = b.openedAt ?? b.ticket;
      return bRecency - aRecency;
    });

  const exactVolumeMatch = matched.find((order) => Math.abs(order.lots - volume) < 1e-6);
  if (exactVolumeMatch) return exactVolumeMatch;

  const freshMatch = requestedAt
    ? matched.find((order) => order.openedAt !== undefined && order.openedAt >= requestedAt - 15000)
    : undefined;
  if (freshMatch) return freshMatch;

  return matched[0] ?? null;
}

async function waitForOpenedOrder(
  connId: string,
  symbol: string,
  operation: "Buy" | "Sell",
  volume: number,
  openedTicket?: number,
  requestedAt?: number,
  directOrder?: OpenOrderSnapshot | null,
): Promise<OpenOrderSnapshot | null> {
  if (directOrder && normalizeSymbol(directOrder.symbol) === normalizeSymbol(symbol) && directOrder.operation === operation) {
    return directOrder;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    if (openedTicket) {
      const byTicket = await getOpenedOrderByTicket(connId, openedTicket);
      if (byTicket) return byTicket;
    }

    const latestMatch = await findLatestOpenedOrder(connId, symbol, operation, volume, requestedAt);
    if (latestMatch) return latestMatch;

    await new Promise((resolve) => setTimeout(resolve, 300 + attempt * 200));
  }

  return null;
}

async function applyStopsToOpenedOrder(connId: string, order: OpenOrderSnapshot, tp?: number, sl?: number): Promise<void> {
  const takeProfit = Number.isFinite(tp) && Number(tp) > 0 ? Number(tp) : 0;
  const stopLoss = Number.isFinite(sl) && Number(sl) > 0 ? Number(sl) : 0;
  let url = `${MT5_API_URL}/OrderModifySafe?id=${encodeURIComponent(connId)}&ticket=${encodeURIComponent(String(order.ticket))}&stoploss=${encodeURIComponent(String(stopLoss))}&takeprofit=${encodeURIComponent(String(takeProfit))}`;

  if (Number.isFinite(order.openPrice) && order.openPrice > 0) {
    url += `&price=${encodeURIComponent(String(order.openPrice))}`;
  }

  await mt5Json(url);
}

async function openTrade(
  connId: string, symbol: string, type: string, volume: number,
  tpPrice?: number, slPrice?: number, entryPrice?: number, slippage?: number
): Promise<{ ticket?: number; error?: string; warning?: string }> {
  const operation = type === "sell" ? "Sell" : "Buy";
  const hasStops = (Number.isFinite(tpPrice) && Number(tpPrice) > 0) || (Number.isFinite(slPrice) && Number(slPrice) > 0);
  const requestedAt = Date.now();
  let url = `${MT5_API_URL}/OrderSendSafe?id=${encodeURIComponent(connId)}&symbol=${encodeURIComponent(symbol)}&operation=${encodeURIComponent(operation)}&volume=${encodeURIComponent(String(volume))}`;
  if (entryPrice && entryPrice > 0) url += `&price=${encodeURIComponent(String(entryPrice))}`;
  if (slippage && slippage >= 0) url += `&slippage=${encodeURIComponent(String(Math.round(slippage)))}`;
  if (slPrice && slPrice > 0) url += `&stoploss=${encodeURIComponent(String(slPrice))}`;
  if (tpPrice && tpPrice > 0) url += `&takeprofit=${encodeURIComponent(String(tpPrice))}`;

  const data = await mt5Json(url, TRADE_TIMEOUT_MS);
  if (isTradeFailurePayload(data)) {
    const payload = asRecord(data) ?? {};
    return { error: String(payload.message ?? payload.error ?? "Trade execution failed") };
  }

  const directOrder = toOpenOrderSnapshot(data);
  if (hasExpectedStops(directOrder, tpPrice, slPrice)) {
    return { ticket: directOrder?.ticket };
  }

  const openedTicket = extractTicket(data);
  const resolvedOrder = await waitForOpenedOrder(connId, symbol, operation, volume, openedTicket, requestedAt, directOrder);
  if (!resolvedOrder) {
    return { error: "Trade request returned success but no opened position was found" };
  }

  if (!hasStops || hasExpectedStops(resolvedOrder, tpPrice, slPrice)) {
    return { ticket: resolvedOrder.ticket };
  }

  try {
    await applyStopsToOpenedOrder(connId, resolvedOrder, tpPrice, slPrice);
    return { ticket: resolvedOrder.ticket };
  } catch (err) {
    console.error("Failed to apply TP/SL after trade open:", err);
    return { ticket: resolvedOrder.ticket, warning: "Trade opened, but TP/SL modification failed" };
  }
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

  const exitMode = String(session.exit_mode || "pips");
  const lotSize = toNumber(session.lot_size);
  const martingaleEnabled = Boolean(session.martingale_enabled);
  const lotScalingEnabled = Boolean(session.lot_scaling_enabled);
  const currentEffectiveLot = toNumber(session.current_effective_lot) || lotSize;
  const effectiveLot = (martingaleEnabled || lotScalingEnabled) ? currentEffectiveLot : lotSize;
  const useMaxLimit = Boolean(session.use_max_trades_limit);
  const maxTrades = useMaxLimit ? toNumber(session.max_trades_per_spike) : 200;
  const BATCH_SIZE = 3;
  const successfulSpikeKeys: string[] = [];
  const tradeMessages: string[] = [];

  for (const spike of [...newSpikes].sort((a, b) => extractIndexNumber(b.symbol) - extractIndexNumber(a.symbol))) {
    const tradeType = getAutoTradeDirection(spike.symbol, spike.direction);
    const quote = await getQuote(connId, spike.symbol);
    const params = await getSymbolParams(connId, spike.symbol);
    const entryPrice = tradeType === "buy" ? quote.ask : quote.bid;

    if (!entryPrice || entryPrice <= 0) {
      const message = `Session ${sessionId}: skipped ${spike.symbol} because no valid quote was available`;
      console.warn(message);
      tradeMessages.push(message);
      continue;
    }

    const slippage = Math.max(2, Math.ceil(params.spread || 0));
    let tpPrice: number | undefined;
    let slPrice: number | undefined;

    if (exitMode === "pips") {
      const tpPips = toNumber(session.take_profit);
      const slPips = toNumber(session.stop_loss);
      if (tpPips > 0) tpPrice = computePriceLevel(entryPrice, tradeType, tpPips, params.tickSize, params.spread, "tp");
      if (slPips > 0) slPrice = computePriceLevel(entryPrice, tradeType, slPips, params.tickSize, params.spread, "sl");
    }

    const allResults: { success: boolean; error?: string; warning?: string; ticket?: number }[] = [];

    for (let i = 0; i < maxTrades; i += BATCH_SIZE) {
      const chunk: Promise<{ success: boolean; error?: string; warning?: string; ticket?: number }>[] = [];
      for (let j = i; j < Math.min(i + BATCH_SIZE, maxTrades); j++) {
        chunk.push((async () => {
          try {
            let freshTp = tpPrice;
            let freshSl = slPrice;
            let freshEntry = entryPrice;

            if (exitMode === "pips") {
              const freshQuote = await getQuote(connId, spike.symbol);
              freshEntry = tradeType === "buy" ? freshQuote.ask : freshQuote.bid;
              if (!freshEntry || freshEntry <= 0) {
                return { success: false, error: "No valid quote returned before trade send" };
              }

              const tpPips = toNumber(session.take_profit);
              const slPips = toNumber(session.stop_loss);
              if (tpPips > 0) freshTp = computePriceLevel(freshEntry, tradeType, tpPips, params.tickSize, params.spread, "tp");
              if (slPips > 0) freshSl = computePriceLevel(freshEntry, tradeType, slPips, params.tickSize, params.spread, "sl");
            }

            const result = await openTrade(connId, spike.symbol, tradeType, effectiveLot, freshTp, freshSl, freshEntry, slippage);
            if (result.error || !result.ticket) {
              return { success: false, error: result.error ?? "Trade was not confirmed by broker" };
            }

            return { success: true, warning: result.warning, ticket: result.ticket };
          } catch (err) {
            console.error("Trade error:", err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
          }
        })());
      }

      const chunkResults = await Promise.all(chunk);
      allResults.push(...chunkResults);
      if (i + BATCH_SIZE < maxTrades) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const totalOpened = allResults.filter(r => r.success).length;
    const warnings = allResults.map((result) => result.warning).filter((warning): warning is string => Boolean(warning));
    const failures = allResults.map((result) => result.error).filter((error): error is string => Boolean(error));

    if (totalOpened > 0) {
      successfulSpikeKeys.push(spike.key);
      const message = `Session ${sessionId}: opened ${totalOpened} trades on ${spike.symbol}`;
      console.log(message);
      tradeMessages.push(message);
      if (warnings.length > 0) {
        const warningMessage = `Session ${sessionId}: ${spike.symbol} warnings — ${warnings.join(" | ")}`;
        console.warn(warningMessage);
        tradeMessages.push(warningMessage);
      }
      continue;
    }

    const failureMessage = `Session ${sessionId}: detected spike on ${spike.symbol} but no trades were confirmed${failures.length > 0 ? ` — ${failures.join(" | ")}` : ""}`;
    console.error(failureMessage);
    tradeMessages.push(failureMessage);
  }

  const trimmedKeys = [...processedKeys, ...successfulSpikeKeys].slice(-500);

  if (!successfulSpikeKeys.length) {
    await sb.from("trading_sessions").update({
      connection_id: connId,
      last_trade_result: tradeMessages[tradeMessages.length - 1] ?? "Spike detected but no trades were confirmed",
      updated_at: new Date().toISOString(),
    }).eq("id", sessionId);
    return;
  }

  const lastProcessedSpikeKey = successfulSpikeKeys[successfulSpikeKeys.length - 1];

  // After trades fire, check if daily P/L limits have been reached
  const updatedAccount = await getAccountInfo(connId);
  const startingBalance = toNumber(session.starting_balance);
  const dailyMaxProfit = toNumber(session.daily_max_profit);
  const dailyMaxLoss = toNumber(session.daily_max_loss);
  const dailyPnl = updatedAccount.balance - startingBalance;

  let shouldDeactivate = false;
  let deactivateReason = "";

  if (dailyMaxProfit > 0 && dailyPnl >= dailyMaxProfit) {
    shouldDeactivate = true;
    deactivateReason = `Daily profit target reached: ${dailyPnl.toFixed(2)} >= ${dailyMaxProfit}`;
  } else if (dailyMaxLoss > 0 && dailyPnl <= -dailyMaxLoss) {
    shouldDeactivate = true;
    deactivateReason = `Daily loss limit reached: ${dailyPnl.toFixed(2)} <= -${dailyMaxLoss}`;
  }

  if (shouldDeactivate) {
    console.log(`Session ${sessionId}: ${deactivateReason} — pausing auto-trade`);
    await sb.from("trading_sessions").update({
      connection_id: connId,
      processed_spike_keys: trimmedKeys,
      last_spike_key: lastProcessedSpikeKey,
      is_active: false,
      last_trade_result: deactivateReason,
      daily_closed_pnl: dailyPnl,
      updated_at: new Date().toISOString(),
    }).eq("id", sessionId);
    return;
  }

  await sb.from("trading_sessions").update({
    connection_id: connId,
    processed_spike_keys: trimmedKeys,
    last_spike_key: lastProcessedSpikeKey,
    daily_closed_pnl: dailyPnl,
    last_trade_result: tradeMessages[tradeMessages.length - 1] ?? null,
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

    if (action === "resetDailyPnl") {
      const { sessionId, startingBalance } = body;
      await sb.from("trading_sessions").update({
        starting_balance: startingBalance || 0,
        daily_closed_pnl: 0,
        is_active: true,
        last_trade_result: null,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
      return new Response(JSON.stringify({ reset: true }), {
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
