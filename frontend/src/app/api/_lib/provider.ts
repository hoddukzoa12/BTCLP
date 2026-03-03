import { RpcProvider } from "starknet";

const providerCache = new Map<string, RpcProvider>();

export function getRpcProvider(): RpcProvider {
  const rpcUrl = process.env.RPC_URL || "https://rpc.sepolia.voyager.online";
  const existing = providerCache.get(rpcUrl);
  if (existing) return existing;

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  providerCache.set(rpcUrl, provider);
  return provider;
}
