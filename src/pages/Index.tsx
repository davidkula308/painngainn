import { useState } from "react";
import BottomNav from "@/components/BottomNav";
import AccountHeader from "@/components/AccountHeader";
import HomeTab from "@/components/HomeTab";
import AccountTab from "@/components/AccountTab";
import TradeTab from "@/components/TradeTab";
import SettingsTab from "@/components/SettingsTab";

type Tab = "home" | "account" | "trade" | "settings";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("account");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <AccountHeader />
      <div className="flex-1 overflow-auto pb-20">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "account" && <AccountTab />}
        {activeTab === "trade" && <TradeTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
