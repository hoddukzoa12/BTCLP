"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useVault } from "@/hooks/useVault";
import { useWbtcBalance } from "@/hooks/useWbtcBalance";
import { formatWbtc, parseWbtc, cn } from "@/lib/utils";

type Tab = "deposit" | "withdraw";
type WithdrawMode = "assets" | "shares";

export function DepositWithdrawPanel() {
  const auth = useAuth();
  const isConnected = auth.authenticated && auth.isWalletReady;
  const vault = useVault();
  const { balance: wbtcBalance } = useWbtcBalance();

  const [activeTab, setActiveTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [withdrawMode, setWithdrawMode] = useState<WithdrawMode>("assets");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse input amount
  const parsedAmount = amount ? parseWbtc(amount) : 0n;

  // On-chain preview: how many shares for deposit, how many assets for redeem
  const { data: previewDepositShares } = vault.usePreviewDeposit(
    activeTab === "deposit" ? parsedAmount : 0n
  );
  const { data: previewRedeemAssets } = vault.usePreviewRedeem(
    activeTab === "withdraw" && withdrawMode === "shares" ? parsedAmount : 0n
  );

  // Reset amount when switching tabs
  useEffect(() => {
    setAmount("");
  }, [activeTab]);

  const handleDeposit = useCallback(async () => {
    if (!isConnected || parsedAmount <= 0n) return;
    setIsSubmitting(true);
    try {
      await vault.deposit(parsedAmount);
      toast.success("Deposit submitted!", {
        description: `Depositing ${formatWbtc(parsedAmount)} wBTC`,
      });
      setAmount("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      toast.error("Deposit failed", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [isConnected, parsedAmount, vault]);

  const handleWithdraw = useCallback(async () => {
    if (!isConnected || parsedAmount <= 0n) return;
    setIsSubmitting(true);
    try {
      if (withdrawMode === "shares") {
        await vault.redeem(parsedAmount);
        toast.success("Redeem submitted!", {
          description: `Redeeming ${formatWbtc(parsedAmount)} shares`,
        });
      } else {
        await vault.withdraw(parsedAmount);
        toast.success("Withdrawal submitted!", {
          description: `Withdrawing ${formatWbtc(parsedAmount)} wBTC`,
        });
      }
      setAmount("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      toast.error("Withdrawal failed", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [isConnected, parsedAmount, withdrawMode, vault]);

  const maxDeposit = wbtcBalance;
  const maxWithdrawAssets = vault.maxWithdraw;
  const maxWithdrawShares = vault.maxRedeem;

  const handleMax = () => {
    if (activeTab === "deposit") {
      setAmount(formatWbtc(maxDeposit));
    } else {
      if (withdrawMode === "assets") {
        setAmount(formatWbtc(maxWithdrawAssets));
      } else {
        setAmount(formatWbtc(maxWithdrawShares));
      }
    }
  };

  const isDisabled = vault.isPaused || !isConnected || isSubmitting;
  const isAmountValid = parsedAmount > 0n;

  return (
    <div className="rounded-xl border border-vault-border bg-vault-card animate-fade-in">
      {/* Tabs */}
      <div className="flex border-b border-vault-border">
        {(["deposit", "withdraw"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all border-b-2",
              activeTab === tab
                ? "border-btc-orange text-btc-orange"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            {tab === "deposit" ? (
              <ArrowDownToLine className="w-4 h-4" />
            ) : (
              <ArrowUpFromLine className="w-4 h-4" />
            )}
            {tab === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {/* Paused warning */}
        {vault.isPaused && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-vault-red/10 border border-vault-red/20">
            <Ban className="w-4 h-4 text-vault-red flex-shrink-0" />
            <span className="text-xs text-vault-red">
              Vault is paused. Deposits and withdrawals are disabled.
            </span>
          </div>
        )}

        {/* Withdraw mode toggle */}
        {activeTab === "withdraw" && (
          <div className="flex rounded-lg bg-vault-surface p-1">
            {(["assets", "shares"] as WithdrawMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setWithdrawMode(mode);
                  setAmount("");
                }}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                  withdrawMode === mode
                    ? "bg-vault-card text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                By {mode === "assets" ? "wBTC Amount" : "Share Amount"}
              </button>
            ))}
          </div>
        )}

        {/* Amount input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-gray-500">
              {activeTab === "deposit"
                ? "Deposit Amount"
                : withdrawMode === "assets"
                  ? "Withdraw Amount (wBTC)"
                  : "Redeem Amount (Shares)"}
            </label>
            <span className="text-xs text-gray-500">
              {activeTab === "deposit"
                ? `Balance: ${formatWbtc(wbtcBalance)} wBTC`
                : withdrawMode === "assets"
                  ? `Max: ${formatWbtc(maxWithdrawAssets)} wBTC`
                  : `Max: ${formatWbtc(maxWithdrawShares)} shares`}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*\.?\d*$/.test(val)) setAmount(val);
              }}
              placeholder="0.00000000"
              disabled={isDisabled}
              className="w-full bg-vault-surface border border-vault-border rounded-lg px-4 py-3 text-white font-mono text-lg placeholder:text-gray-700 focus:outline-none focus:border-btc-orange/50 focus:ring-1 focus:ring-btc-orange/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
            <button
              onClick={handleMax}
              disabled={isDisabled}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-btc-orange/10 text-btc-orange text-xs font-medium hover:bg-btc-orange/20 disabled:opacity-50 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Preview */}
        {isAmountValid && (
          <div className="p-3 rounded-lg bg-vault-surface space-y-1.5 animate-fade-in">
            {activeTab === "deposit" && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">You will receive (est.)</span>
                <span className="font-mono text-gray-300">
                  ~{formatWbtc(previewDepositShares ?? parsedAmount)} bfVault
                </span>
              </div>
            )}
            {activeTab === "withdraw" && withdrawMode === "shares" && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">wBTC to receive (est.)</span>
                <span className="font-mono text-gray-300">
                  ~{formatWbtc(previewRedeemAssets ?? parsedAmount)} wBTC
                </span>
              </div>
            )}
            {activeTab === "withdraw" && withdrawMode === "assets" && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Shares to burn (est.)</span>
                <span className="font-mono text-gray-300">
                  ~{formatWbtc(parsedAmount)} bfVault
                </span>
              </div>
            )}
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={activeTab === "deposit" ? handleDeposit : handleWithdraw}
          disabled={isDisabled || !isAmountValid}
          className={cn(
            "w-full py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2",
            isDisabled || !isAmountValid
              ? "bg-gray-800 text-gray-600 cursor-not-allowed"
              : activeTab === "deposit"
                ? "bg-gradient-to-r from-btc-orange to-btc-deep text-white hover:shadow-lg hover:shadow-btc-orange/20"
                : "bg-vault-blue text-white hover:shadow-lg hover:shadow-vault-blue/20"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {activeTab === "deposit" ? "Depositing..." : "Withdrawing..."}
            </>
          ) : !isConnected ? (
            "Connect Wallet"
          ) : (
            <>
              {activeTab === "deposit" ? (
                <>
                  <ArrowDownToLine className="w-4 h-4" />
                  Deposit wBTC
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="w-4 h-4" />
                  {withdrawMode === "assets" ? "Withdraw wBTC" : "Redeem Shares"}
                </>
              )}
            </>
          )}
        </button>

        {/* Info text */}
        {activeTab === "deposit" && isConnected && (
          <p className="text-[10px] text-gray-600 text-center">
            Approve + Deposit in a single transaction via Starknet multicall
          </p>
        )}
      </div>
    </div>
  );
}
