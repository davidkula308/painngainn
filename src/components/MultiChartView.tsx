import SymbolChart from "./SymbolChart";
import PositionManagementPanel from "./PositionManagementPanel";
import { useMetaApi } from "@/contexts/MetaApiContext";

interface MultiChartViewProps {
  selectedSymbol: string | null;
}

const MultiChartView = ({ selectedSymbol }: MultiChartViewProps) => {
  const { watchList, spikes } = useMetaApi();
  const displaySymbols = selectedSymbol ? [selectedSymbol] : watchList.slice(0, 4);

  const recentSpikes = spikes.filter((s) => Date.now() - s.timestamp < 10000);

  // Single symbol = full width chart
  if (displaySymbols.length === 1) {
    const sym = displaySymbols[0];
    const hasSpike = recentSpikes.some((s) => s.symbol === sym);
    return (
      <div className="flex flex-col gap-2 h-full">
        <div className={`flex-1 bg-card border border-border rounded-lg overflow-hidden flex flex-col min-h-[300px] ${hasSpike ? "spike-flash" : ""}`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-mono font-bold">{sym}</span>
            {hasSpike && (
              <span className="text-[10px] bg-bearish/15 text-bearish px-2 py-0.5 rounded-full font-bold">
                SPIKE
              </span>
            )}
          </div>
          <div className="flex-1 min-h-[250px]">
            <SymbolChart symbol={sym} />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <PositionManagementPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
        {displaySymbols.length === 0 ? (
          <div className="col-span-full flex items-center justify-center h-full text-muted-foreground text-sm">
            Select symbols to view charts
          </div>
        ) : (
          displaySymbols.map((sym) => {
            const hasSpike = recentSpikes.some((s) => s.symbol === sym);
            return (
              <div key={sym} className={`bg-card border border-border rounded-lg overflow-hidden flex flex-col ${hasSpike ? "spike-flash" : ""}`}>
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                  <span className="text-xs font-mono font-bold">{sym}</span>
                  {hasSpike && (
                    <span className="text-[9px] bg-bearish/15 text-bearish px-1.5 py-0.5 rounded-full font-bold">
                      SPIKE
                    </span>
                  )}
                </div>
                <div className="flex-1 min-h-[200px] sm:min-h-[220px]">
                  <SymbolChart symbol={sym} />
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <PositionManagementPanel />
      </div>
    </div>
  );
};

export default MultiChartView;
