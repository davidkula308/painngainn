import { useMetaApi } from "@/contexts/MetaApiContext";

const AccountHeader = () => {
  const { isConnected, accountInfo } = useMetaApi();

  if (!isConnected || !accountInfo) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-card/80 backdrop-blur-sm border-b border-border text-xs font-mono overflow-x-auto">
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${isConnected ? "bg-bullish/15 text-bullish" : "bg-bearish/15 text-bearish"}`}>
        {isConnected ? "Live" : "Off"}
      </span>
      <div className="flex items-center gap-3 text-[11px]">
        <span className="text-muted-foreground">Bal <span className="text-foreground font-semibold">${accountInfo.balance.toFixed(2)}</span></span>
        <span className="text-muted-foreground">Eq <span className="text-foreground font-semibold">${accountInfo.equity.toFixed(2)}</span></span>
        <span className="text-muted-foreground hidden sm:inline">Margin <span className="text-foreground font-semibold">${accountInfo.margin.toFixed(2)}</span></span>
        <span className="text-muted-foreground hidden sm:inline">Free <span className="text-foreground font-semibold">${accountInfo.freeMargin.toFixed(2)}</span></span>
        <span className="text-muted-foreground hidden md:inline">Level <span className="text-foreground font-semibold">{accountInfo.marginLevel.toFixed(1)}%</span></span>
      </div>
    </div>
  );
};

export default AccountHeader;
