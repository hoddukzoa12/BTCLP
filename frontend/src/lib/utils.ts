import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { WBTC_DECIMALS, ORACLE_DECIMALS } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWbtc(amount: bigint | undefined, maxDecimals = 6): string {
  if (amount === undefined || amount === null) return "0.000000";
  const divisor = BigInt(10 ** WBTC_DECIMALS);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(WBTC_DECIMALS, "0").slice(0, maxDecimals);
  return `${whole}.${fracStr}`;
}

export function parseWbtc(amount: string): bigint {
  if (!amount || amount === "") return BigInt(0);
  const [whole = "0", frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(WBTC_DECIMALS, "0").slice(0, WBTC_DECIMALS);
  return BigInt(whole || "0") * BigInt(10 ** WBTC_DECIMALS) + BigInt(fracPadded);
}

export function formatBps(bps: number | undefined): string {
  if (bps === undefined || bps === null) return "0.0%";
  return `${(bps / 100).toFixed(1)}%`;
}

export function formatUsd(price: bigint | undefined, decimals = ORACLE_DECIMALS): string {
  if (price === undefined || price === null) return "$0";
  const num = Number(price) / 10 ** decimals;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatUsdDetailed(price: bigint | undefined, decimals = ORACLE_DECIMALS): string {
  if (price === undefined || price === null) return "$0.00";
  const num = Number(price) / 10 ** decimals;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function getStarkscanUrl(txHash: string): string {
  return `https://sepolia.starkscan.co/tx/${txHash}`;
}

export function getVoyagerUrl(txHash: string): string {
  return `https://sepolia.voyager.online/tx/${txHash}`;
}

export function bigintToNumber(value: bigint | undefined, decimals: number): number {
  if (value === undefined || value === null) return 0;
  return Number(value) / 10 ** decimals;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
