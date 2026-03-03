import { RpcProvider } from "starknet";

const DEFAULT_RPC_URL = "https://starknet-sepolia.public.blastapi.io";

const providerCache = new Map<string, RpcProvider>();

export function getRpcProvider(): RpcProvider {
  const rpcUrl =
    process.env.NEXT_PUBLIC_STARKNET_RPC_URL || DEFAULT_RPC_URL;
  const existing = providerCache.get(rpcUrl);
  if (existing) return existing;

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  providerCache.set(rpcUrl, provider);
  return provider;
}
