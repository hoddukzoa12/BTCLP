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
} from "lucide-react";
import { generateMockEvents } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import type { EventType } from "@/lib/types";

const EVENT_CONFIG: Record<
  EventType,
  { icon: typeof ArrowDownToLine; color: string; bgColor: string }
> = {
  Deposit: { icon: ArrowDownToLine, color: "text-vault-green", bgColor: "bg-vault-green/10" },
  Withdraw: { icon: ArrowUpFromLine, color: "text-btc-orange", bgColor: "bg-btc-orange/10" },
  StateChanged: { icon: RefreshCw, color: "text-purple-400", bgColor: "bg-purple-400/10" },
  RebalanceExecuted: { icon: Activity, color: "text-teal-400", bgColor: "bg-teal-400/10" },
  AllocationChanged: { icon: PieChart, color: "text-vault-blue", bgColor: "bg-vault-blue/10" },
  EmergencyWithdraw: { icon: AlertTriangle, color: "text-vault-red", bgColor: "bg-vault-red/10" },
  Paused: { icon: Pause, color: "text-yellow-400", bgColor: "bg-yellow-400/10" },
  Unpaused: { icon: Play, color: "text-vault-green", bgColor: "bg-vault-green/10" },
};

function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function EventLog() {
  const events = generateMockEvents();

  return (
    <div className="rounded-xl border border-vault-border bg-vault-card animate-fade-in">
      <div className="p-4 border-b border-vault-border">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Recent Events
        </h3>
      </div>

      <div className="divide-y divide-vault-border max-h-64 overflow-y-auto">
        {events.map((event) => {
          const config = EVENT_CONFIG[event.type];
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
                      {event.type.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono truncate">
                    {Object.entries(event.data)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" | ")}
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

      <div className="p-3 border-t border-vault-border text-center">
        <span className="text-[10px] text-gray-600">
          Mock data for hackathon demo
        </span>
      </div>
    </div>
  );
}
