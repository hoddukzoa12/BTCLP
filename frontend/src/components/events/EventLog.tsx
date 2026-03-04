"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Activity,
  AlertTriangle,
  PieChart,
  Pause,
  Play,
  ExternalLink,
  Settings,
  Loader2,
} from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { shortenAddress } from "@/lib/utils";

const EVENT_CONFIG: Record<
  string,
  { icon: typeof ArrowDownToLine; color: string; bgColor: string }
> = {
  Deposit: { icon: ArrowDownToLine, color: "text-vault-green", bgColor: "bg-vault-green/10" },
  Withdraw: { icon: ArrowUpFromLine, color: "text-btc-orange", bgColor: "bg-btc-orange/10" },
  StateChanged: { icon: RefreshCw, color: "text-purple-400", bgColor: "bg-purple-400/10" },
  RebalanceExecuted: { icon: Activity, color: "text-teal-400", bgColor: "bg-teal-400/10" },
  AllocationChanged: { icon: PieChart, color: "text-vault-blue", bgColor: "bg-vault-blue/10" },
  PriceBoundsUpdated: { icon: Settings, color: "text-btc-gold", bgColor: "bg-btc-gold/10" },
  EmergencyWithdraw: { icon: AlertTriangle, color: "text-vault-red", bgColor: "bg-vault-red/10" },
  Paused: { icon: Pause, color: "text-yellow-400", bgColor: "bg-yellow-400/10" },
  Unpaused: { icon: Play, color: "text-vault-green", bgColor: "bg-vault-green/10" },
};

const DEFAULT_CONFIG = {
  icon: Activity,
  color: "text-gray-400",
  bgColor: "bg-gray-400/10",
};

function formatEventName(type: string): string {
  return type.replace(/([A-Z])/g, " $1").trim();
}

export function EventLog() {
  const { data: events, isLoading, isError } = useEvents();

  return (
    <div className="rounded-xl border border-vault-border bg-vault-card animate-fade-in">
      <div className="p-4 border-b border-vault-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Recent Events
        </h3>
        <span className="text-[10px] text-gray-600">On-chain</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          <span className="text-xs text-gray-500">Loading events...</span>
        </div>
      ) : isError ? (
        <div className="py-8 text-center">
          <span className="text-xs text-gray-600">Failed to load events</span>
        </div>
      ) : !events || events.length === 0 ? (
        <div className="py-8 text-center">
          <span className="text-xs text-gray-600">No events yet</span>
        </div>
      ) : (
        <div className="divide-y divide-vault-border max-h-64 overflow-y-auto">
          {events.map((event) => {
            const config = EVENT_CONFIG[event.type] || DEFAULT_CONFIG;
            const Icon = config.icon;

            return (
              <div key={event.id} className="px-4 py-3 hover:bg-vault-surface/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn("p-1.5 rounded-lg", config.bgColor)}>
                    <Icon className={cn("w-3 h-3", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-300">
                        {formatEventName(event.type)}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        Block #{event.blockNumber}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono truncate">
                      tx: {shortenAddress(event.txHash, 6)}
                    </div>
                  </div>
                  <a
                    href={`https://sepolia.starkscan.co/tx/${event.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-btc-orange transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
