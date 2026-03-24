import SymbolChart from "./SymbolChart";
import PositionManagementPanel from "./PositionManagementPanel";
import { useMetaApi } from "@/contexts/MetaApiContext";

interface MultiChartViewProps {
  selectedSymbol: string | null;
}

const MultiChartView = ({ selectedSymbol }: MultiChartViewProps) => {
  const { watchList, spikes } = useMetaApi();
  const displaySymbols = selectedSymbol ? [selectedSymbol] : watchList.slice(0, 3);

  const recentSpikes = spikes.filter((s) => Date.now() - s.timestamp < 10000);

  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      {displaySymbols.length === 0 ? (
        <div className="col-span-2 flex items-center justify-center h-full text-muted-foreground text-sm">
          Select symbols to view charts
        </div>
      ) : (
        displaySymbols.map((sym) => {
          const hasSpike = recentSpikes.some((s) => s.symbol === sym);
          return (
            <div key={sym} className={`bg-card border border-border rounded overflow-hidden flex flex-col ${hasSpike ? "spike-flash" : ""}`}>
              <div className="flex items-center justify-between px-2 py-1 border-b border-border">
                <span className="text-xs font-mono font-semibold">{sym}</span>
                {hasSpike && (
                  <span className="text-[9px] bg-bearish/20 text-bearish px-1.5 py-0.5 rounded font-semibold">
                    SPIKE
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-[180px]">
                <SymbolChart symbol={sym} />
              </div>
            </div>
          );
        })
      )}
      {/* Position Management Panel replaces 4th chart */}
      <div className="bg-card border border-border rounded overflow-hidden flex flex-col">
        <PositionManagementPanel />
      </div>
    </div>
  );
};

export default MultiChartView;
