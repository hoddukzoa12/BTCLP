"use client";

import { useState } from "react";
import { Gauge, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useManager } from "@/hooks/useManager";
import { formatUsd, cn } from "@/lib/utils";

const PRESETS = [
  { label: "$99,000", value: 99_000, tag: "Out of Range", tagColor: "text-vault-red" },
  { label: "$100,000", value: 100_000, tag: "In Range", tagColor: "text-vault-green" },
  { label: "$105,000", value: 105_000, tag: "Out of Range", tagColor: "text-vault-red" },
] as const;

export function OraclePricePanel() {
  const auth = useAuth();
  const manager = useManager();
  const queryClient = useQueryClient();
  const [customPrice, setCustomPrice] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  const isConnected = auth.authenticated && auth.isWalletReady;
  if (!isConnected) return null;

  const invalidateAll = () => queryClient.invalidateQueries();

  const sendSetPrice = async (priceUsd: number) => {
    setIsUpdating(true);
    try {
      const res = await fetch("/api/oracle/demo-rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceUsd }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "API request failed");
      }

      await invalidateAll();

      toast.success(`Oracle price → $${priceUsd.toLocaleString()}`);

      if (data.rebalanceTxHash) {
        toast.success("Auto-rebalance executed!");
      } else {
        toast.info("Price updated. Rebalance skipped (no state change needed or vault empty).");
      }

      setJustUpdated(true);
      setCustomPrice("");
      setTimeout(() => setJustUpdated(false), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      toast.error("Set price failed", { description: message });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCustomSubmit = () => {
    const parsed = Number(customPrice.replace(/,/g, ""));
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Invalid price", { description: "Enter a positive USD value" });
      return;
    }
    sendSetPrice(parsed);
  };

  return (
    <div className="rounded-xl border border-vault-border bg-vault-card p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-4 h-4 text-btc-gold" />
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Mock Oracle Control
        </h3>
        <span className="ml-auto text-[10px] bg-btc-gold/10 px-2 py-0.5 rounded-full text-btc-gold">
          Demo
        </span>
      </div>

      {/* Current price */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-1">Current Oracle Price</p>
        <p className="text-2xl font-mono font-bold text-btc-orange">
          {formatUsd(manager.btcPrice)}
        </p>
      </div>

      {/* Preset buttons */}
      <div className="space-y-2 mb-4">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">
          Set Price & Auto-Rebalance
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => sendSetPrice(preset.value)}
              disabled={isUpdating}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border text-sm font-medium transition-all",
                "border-vault-border bg-vault-surface hover:bg-vault-border/50",
                isUpdating && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="text-white font-mono text-xs">{preset.label}</span>
              <span className={cn("text-[9px] font-medium", preset.tagColor)}>
                {preset.tag}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom input */}
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">
          Custom Price (USD)
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            placeholder="e.g. 102000"
            disabled={isUpdating}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg bg-vault-surface border border-vault-border",
              "text-white text-sm font-mono placeholder:text-gray-600",
              "focus:outline-none focus:border-btc-orange/50",
              isUpdating && "opacity-50"
            )}
          />
          <button
            onClick={handleCustomSubmit}
            disabled={isUpdating || !customPrice}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              justUpdated
                ? "bg-vault-green/20 text-vault-green border border-vault-green/30"
                : "bg-btc-orange/20 text-btc-orange border border-btc-orange/30 hover:bg-btc-orange/30",
              (isUpdating || !customPrice) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : justUpdated ? (
              <Check className="w-4 h-4" />
            ) : null}
            {isUpdating ? "Updating..." : justUpdated ? "Done!" : "Set Price"}
          </button>
        </div>
      </div>

      {/* Demo guide */}
      <div className="mt-4 p-3 rounded-lg bg-vault-surface border border-vault-border">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          <span className="text-btc-gold font-medium">Demo:</span>{" "}
          1. Deposit wBTC → 2. $105K (Escape→Vesu) → 3. $100K (Return→Ekubo)
        </p>
      </div>
    </div>
  );
}
