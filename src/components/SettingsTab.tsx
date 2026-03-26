import { useState, useEffect } from "react";
import { useMetaApi } from "@/contexts/MetaApiContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Download, Volume2 } from "lucide-react";

const SOUND_OPTIONS = [
  { value: "beep", label: "Beep (Default)" },
  { value: "chime", label: "Chime" },
  { value: "alert", label: "Alert Siren" },
  { value: "ding", label: "Ding" },
  { value: "none", label: "No Sound" },
];

function playPreviewSound(soundType: string) {
  if (soundType === "none") return;
  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const ctx = new AudioContextCtor();

  const freqMap: Record<string, number[]> = {
    beep: [860, 860],
    chime: [523, 659, 784],
    alert: [440, 880, 440],
    ding: [1200],
  };
  const freqs = freqMap[soundType] || [860];

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = soundType === "alert" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.15 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.15 + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.14);
  });

  setTimeout(() => ctx.close(), 1000);
}

const SettingsTab = () => {
  const {
    spikeSound, setSpikeSound,
    tradeSound, setTradeSound,
  } = useMetaApi();

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      toast.info("To install: use your browser menu → 'Add to Home Screen' or 'Install App'");
      return;
    }
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
      toast.success("App installed successfully!");
    }
    setInstallPrompt(null);
  };

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* Install App */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Download size={16} /> Install App
        </h2>
        {isInstalled ? (
          <p className="text-xs text-bullish">✓ App is installed on this device</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Install GainxPainx as a standalone app on your device for a native experience.
            </p>
            <Button onClick={handleInstall} className="w-full">
              Install to Device
            </Button>
          </>
        )}
      </div>

      {/* Sound Alerts */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Volume2 size={16} /> Sound Alerts
        </h2>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Spike Detection Sound</Label>
          <div className="flex gap-2">
            <select
              value={spikeSound}
              onChange={(e) => setSpikeSound(e.target.value)}
              className="flex-1 bg-muted border border-border rounded px-2 py-1.5 text-sm font-mono text-foreground"
            >
              {SOUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => playPreviewSound(spikeSound)}>
              Test
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Trade Execution Sound</Label>
          <div className="flex gap-2">
            <select
              value={tradeSound}
              onChange={(e) => setTradeSound(e.target.value)}
              className="flex-1 bg-muted border border-border rounded px-2 py-1.5 text-sm font-mono text-foreground"
            >
              {SOUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => playPreviewSound(tradeSound)}>
              Test
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default SettingsTab;
