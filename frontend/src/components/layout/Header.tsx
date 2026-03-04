"use client";

import { useEffect, useState, useCallback } from "react";
import { Bitcoin, Wallet, LogOut, Loader2, Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { shortenAddress } from "@/lib/utils";

export function Header() {
  const auth = useAuth();
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(async () => {
    if (!auth.walletAddress) return;
    await navigator.clipboard.writeText(auth.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [auth.walletAddress]);

  // Auto-create (or recover) wallet when authenticated but no wallet exists.
  // isCreating guard prevents duplicate calls from React Strict Mode / fast re-renders.
  const [isCreating, setIsCreating] = useState(false);
  useEffect(() => {
    if (auth.authenticated && auth.ready && !auth.isWalletReady && !auth.isTxPending && !isCreating) {
      setIsCreating(true);
      auth.createWallet()
        .catch(() => {
          // Wallet creation failed — user can retry via page reload
        })
        .finally(() => setIsCreating(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authenticated, auth.ready, auth.isWalletReady, auth.isTxPending, isCreating]);

  return (
    <header className="sticky top-0 z-50 border-b border-vault-border bg-vault-dark/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-btc-orange to-btc-deep flex items-center justify-center shadow-lg">
                <Bitcoin className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-vault-green rounded-full border-2 border-vault-dark" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg tracking-tight text-white">
                BTCFi <span className="text-btc-orange">Vault</span>
              </h1>
              <p className="text-[10px] text-gray-500 font-mono -mt-0.5">
                Auto LP &amp; Lending
              </p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Network badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vault-surface border border-vault-border">
              <div className="w-2 h-2 rounded-full bg-btc-orange animate-pulse-dot" />
              <span className="text-xs font-mono text-gray-400">Sepolia</span>
            </div>

            {/* Wallet */}
            {auth.authenticated && auth.isWalletReady && auth.walletAddress ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vault-surface border border-vault-border">
                  <Wallet className="w-3.5 h-3.5 text-btc-orange" />
                  <span className="text-xs font-mono text-gray-300">
                    {shortenAddress(auth.walletAddress)}
                  </span>
                  <button
                    onClick={copyAddress}
                    className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors"
                    title="Copy address"
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-vault-green" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-500 hover:text-gray-300 transition-colors" />
                    )}
                  </button>
                </div>
                <button
                  onClick={() => auth.logout()}
                  className="p-2 rounded-lg bg-vault-surface border border-vault-border hover:border-vault-red/50 transition-colors group"
                >
                  <LogOut className="w-3.5 h-3.5 text-gray-500 group-hover:text-vault-red transition-colors" />
                </button>
              </div>
            ) : auth.authenticated && !auth.isWalletReady ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-vault-surface border border-vault-border">
                <Loader2 className="w-3.5 h-3.5 text-btc-orange animate-spin" />
                <span className="text-xs font-mono text-gray-400">
                  Setting up...
                </span>
              </div>
            ) : (
              <button
                onClick={() => auth.login()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-btc-orange to-btc-deep text-white font-medium text-sm hover:shadow-lg hover:shadow-btc-orange/20 transition-all"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
