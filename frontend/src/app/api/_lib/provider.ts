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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResourceBounds = any;

const GAS_PRICE_CACHE_TTL = 15_000; // 15 seconds
let cachedBounds: { bounds: ResourceBounds; ts: number } | null = null;

/**
 * Fetch current gas prices from the latest block and build V3 resourceBounds.
 * Results are cached for 15 seconds to avoid redundant RPC calls.
 */
export async function getResourceBounds(): Promise<ResourceBounds> {
  if (cachedBounds && Date.now() - cachedBounds.ts < GAS_PRICE_CACHE_TTL) {
    return cachedBounds.bounds;
  }

  const provider = getRpcProvider();
  const block = await provider.getBlock("latest");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = block as any;

  const toHex = (n: bigint) => "0x" + n.toString(16);
  const l1Price = BigInt(b.l1_gas_price?.price_in_fri ?? "0x174876e800");
  const l1DataPrice = BigInt(b.l1_data_gas_price?.price_in_fri ?? "0x174876e800");
  const l2Price = BigInt(b.l2_gas_price?.price_in_fri ?? "0x174876e800");

  const bounds = {
    l1_gas: { max_amount: "0x2710", max_price_per_unit: toHex(l1Price * 3n) },
    l2_gas: { max_amount: "0x1000000", max_price_per_unit: toHex(l2Price * 3n) },
    l1_data_gas: { max_amount: "0x2710", max_price_per_unit: toHex(l1DataPrice * 3n) },
  };

  cachedBounds = { bounds, ts: Date.now() };
  return bounds;
}
