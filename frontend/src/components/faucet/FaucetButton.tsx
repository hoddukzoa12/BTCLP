"use client";

import { useState } from "react";
import { Droplets, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWbtcBalance } from "@/hooks/useWbtcBalance";
import { ADDRESSES } from "@/lib/addresses";
import { ONE_WBTC } from "@/lib/constants";
import { formatWbtc, cn } from "@/lib/utils";
import { cairo, CallData } from "starknet";

const FAUCET_AMOUNT = ONE_WBTC; // 1 wBTC per faucet click

export function FaucetButton() {
  const auth = useAuth();
  const { balance } = useWbtcBalance();
  const [isMinting, setIsMinting] = useState(false);
  const [justMinted, setJustMinted] = useState(false);

  const isConnected = auth.authenticated && auth.isWalletReady;

  const handleMint = async () => {
    if (!isConnected || !auth.walletAddress) return;

    setIsMinting(true);
    try {
      await auth.executeTransaction([
        {
          contractAddress: ADDRESSES.sepolia.wbtc,
          entrypoint: "mint_to",
          calldata: CallData.compile([
            auth.walletAddress,
            cairo.uint256(FAUCET_AMOUNT),
          ]),
        },
      ]);

      toast.success("Faucet success!", {
        description: `Received ${formatWbtc(FAUCET_AMOUNT)} test wBTC`,
      });

      setJustMinted(true);
      setTimeout(() => setJustMinted(false), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Faucet failed";
      // Provide actionable guidance for common errors
      if (message.includes("auto-deploy failed") || message.includes("Contract not found")) {
        toast.error("Account needs ETH for gas", {
          description: "Your account is being deployed. Get Starknet Sepolia ETH from starknet-faucet.vercel.app first.",
          duration: 8000,
        });
      } else {
        toast.error("Faucet failed", { description: message });
      }
    } finally {
      setIsMinting(false);
    }
  };

  if (!isConnected) return null;

  return (
    <div className="rounded-xl border border-vault-border bg-vault-card p-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-vault-blue" />
            <span className="text-sm font-medium text-white">
              Testnet Faucet
            </span>
          </div>
          <p className="text-[11px] text-gray-500">
            Mint {formatWbtc(FAUCET_AMOUNT)} test wBTC to your wallet
          </p>
          <p className="text-[11px] text-gray-500 font-mono">
            Balance: {formatWbtc(balance)} wBTC
          </p>
        </div>

        <button
          onClick={handleMint}
          disabled={isMinting || !isConnected}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            justMinted
              ? "bg-vault-green/20 text-vault-green border border-vault-green/30"
              : "bg-vault-blue/20 text-vault-blue border border-vault-blue/30 hover:bg-vault-blue/30",
            (isMinting || !isConnected) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isMinting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Minting...
            </>
          ) : justMinted ? (
            <>
              <Check className="w-4 h-4" />
              Minted!
            </>
          ) : (
            <>
              <Droplets className="w-4 h-4" />
              Get Test wBTC
            </>
          )}
        </button>
      </div>
    </div>
  );
}
