import { useMetaApi } from "@/contexts/MetaApiContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

const PositionManagementPanel = () => {
  const { openPositions, closePosition, isConnected, fetchOpenPositions } = useMetaApi();
  const [closingTickets, setClosingTickets] = useState<Set<number>>(new Set());

  const handleClose = async (ticket: number, symbol: string, type: string, volume: number) => {
    setClosingTickets((prev) => new Set(prev).add(ticket));
    try {
      await closePosition(ticket, symbol, type, volume);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Close failed");
    } finally {
      setClosingTickets((prev) => {
        const next = new Set(prev);
        next.delete(ticket);
        return next;
      });
    }
  };

  const handleCloseAll = async () => {
    for (const pos of openPositions) {
      await handleClose(pos.ticket, pos.symbol, pos.type, pos.volume);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Connect to view positions
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border">
        <span className="text-xs font-mono font-semibold">Positions ({openPositions.length})</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[9px]"
            onClick={() => fetchOpenPositions()}
          >
            Refresh
          </Button>
          {openPositions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-5 px-1.5 text-[9px]"
              onClick={handleCloseAll}
            >
              Close All
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {openPositions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-[10px]">
            No open positions
          </div>
        ) : (
          <div className="divide-y divide-border">
            {openPositions.map((pos) => (
              <div key={pos.ticket} className="px-2 py-1.5 text-[10px] font-mono space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{pos.symbol}</span>
                  <span className={pos.type === "buy" ? "text-bullish" : "text-bearish"}>
                    {pos.type.toUpperCase()} {pos.volume}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Open: {pos.openPrice.toFixed(5)}</span>
                  <span className={pos.profit >= 0 ? "text-bullish" : "text-bearish"}>
                    {pos.profit >= 0 ? "+" : ""}{pos.profit.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>TP: {pos.tp || "—"} | SL: {pos.sl || "—"}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-4 px-1.5 text-[9px] border-bearish/40 text-bearish hover:bg-bearish/10"
                    onClick={() => handleClose(pos.ticket, pos.symbol, pos.type, pos.volume)}
                    disabled={closingTickets.has(pos.ticket)}
                  >
                    {closingTickets.has(pos.ticket) ? "..." : "Close"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PositionManagementPanel;
