"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { Bitcoin, Wallet, LogOut, ExternalLink } from "lucide-react";
import { shortenAddress } from "@/lib/utils";

const WALLET_URLS: Record<string, string> = {
  argentX: "https://www.argent.xyz/argent-x/",
  braavos: "https://braavos.app/download-braavos-wallet/",
};

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleConnect = (connector: (typeof connectors)[number]) => {
    const isAvailable = connector.available();
    if (isAvailable) {
      connect({ connector });
      setShowDropdown(false);
    } else {
      // Wallet not installed — open install page
      const url = WALLET_URLS[connector.id];
      if (url) {
        window.open(url, "_blank");
      }
    }
  };

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
            {isConnected && address ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-vault-surface border border-vault-border">
                  <Wallet className="w-3.5 h-3.5 text-btc-orange" />
                  <span className="text-xs font-mono text-gray-300">
                    {shortenAddress(address)}
                  </span>
                </div>
                <button
                  onClick={() => disconnect()}
                  className="p-2 rounded-lg bg-vault-surface border border-vault-border hover:border-vault-red/50 transition-colors group"
                >
                  <LogOut className="w-3.5 h-3.5 text-gray-500 group-hover:text-vault-red transition-colors" />
                </button>
              </div>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-btc-orange to-btc-deep text-white font-medium text-sm hover:shadow-lg hover:shadow-btc-orange/20 transition-all"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </button>
                {showDropdown && connectors.length > 0 && (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg bg-vault-card border border-vault-border shadow-xl z-50 overflow-hidden animate-fade-in">
                    <div className="px-3 py-2 border-b border-vault-border">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                        Choose Wallet
                      </span>
                    </div>
                    {connectors.map((connector) => {
                      const available = connector.available();
                      return (
                        <button
                          key={connector.id}
                          onClick={() => handleConnect(connector)}
                          className="w-full text-left px-4 py-3 text-sm hover:bg-vault-surface transition-colors flex items-center gap-3"
                        >
                          <div className="w-7 h-7 rounded-md bg-vault-surface flex items-center justify-center flex-shrink-0">
                            {connector.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={typeof connector.icon === "string" ? connector.icon : connector.icon.dark}
                                alt={connector.name}
                                className="w-5 h-5 rounded-sm"
                              />
                            ) : (
                              <Wallet className="w-3.5 h-3.5 text-btc-orange" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={available ? "text-gray-200" : "text-gray-500"}>
                              {connector.name}
                            </span>
                            {!available && (
                              <div className="flex items-center gap-1 text-[10px] text-btc-orange">
                                <span>Install</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>
                          {available && (
                            <div className="w-2 h-2 rounded-full bg-vault-green flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
