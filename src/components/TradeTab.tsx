import { useState, useEffect } from "react";
import { useMetaApi } from "@/contexts/MetaApiContext";
import MultiChartView from "./MultiChartView";
import ManualTradePanel from "./ManualTradePanel";

const TIMEFRAMES = [
  { value: "1m", label: "1M" },
  { value: "5m", label: "5M" },
  { value: "15m", label: "15M" },
  { value: "30m", label: "30M" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
];

const TradeTab = () => {
  const {
    isConnected, watchList, ticks, subscribeTick,
    timeframe, setTimeframe,
    autoTradeSymbols, spikes,
  } = useMetaApi();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showSymbolList, setShowSymbolList] = useState(false);
  const scanCount = autoTradeSymbols.length > 0 ? autoTradeSymbols.length : watchList.length;

  useEffect(() => {
    if (!isConnected) return;
    watchList.forEach((s) => subscribeTick(s));
  }, [isConnected, watchList, subscribeTick]);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Connect your MT5 account first
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50">
        <button
          onClick={() => setShowSymbolList(!showSymbolList)}
          className="text-xs font-mono font-semibold px-3 py-1.5 rounded-lg bg-muted hover:bg-accent transition-colors"
        >
          {selectedSymbol || "All Symbols"} ▾
        </button>
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 text-[10px] font-mono font-semibold rounded transition-colors ${
                timeframe === tf.value
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-bullish animate-pulse" />
          <span className="text-[10px] text-muted-foreground font-mono">
            {scanCount} symbols
          </span>
        </div>
      </div>

      {/* Symbol dropdown */}
      {showSymbolList && (
        <div className="absolute z-40 top-24 left-3 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-auto w-48">
          <button
            onClick={() => { setSelectedSymbol(null); setShowSymbolList(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-muted transition-colors ${!selectedSymbol ? "text-primary font-semibold" : ""}`}
          >
            All Symbols
          </button>
          {watchList.map((sym) => {
            const tick = ticks[sym];
            const hasSpike = spikes.some((s) => s.symbol === sym && Date.now() - s.timestamp < 10000);
            const isAutoTraded = autoTradeSymbols.includes(sym);
            return (
              <button
                key={sym}
                onClick={() => { setSelectedSymbol(sym); setShowSymbolList(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-muted ${
                  selectedSymbol === sym ? "bg-primary/10 text-primary" : ""
                } ${hasSpike ? "border-l-2 border-l-bearish" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  {isAutoTraded && <span className="w-1.5 h-1.5 rounded-full bg-bullish" />}
                  <span className="font-mono font-medium">{sym}</span>
                </div>
                {tick && (
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {tick.bid.toFixed(5)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main content - charts take most space */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 overflow-auto p-2">
          <MultiChartView selectedSymbol={selectedSymbol} />
        </div>
        <div className="lg:w-72 border-t lg:border-t-0 lg:border-l border-border overflow-auto">
          <ManualTradePanel selectedSymbol={selectedSymbol} />
        </div>
      </div>
    </div>
  );
};

export default TradeTab;
