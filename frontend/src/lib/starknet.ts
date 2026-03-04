import { RpcProvider, Contract } from 'starknet';
import type { Abi } from 'starknet';

const DEFAULT_RPC_URL = 'https://starknet-sepolia.public.blastapi.io';

let cachedProvider: RpcProvider | null = null;
let cachedUrl: string | null = null;

/**
 * Returns a cached RpcProvider for the configured StarkNet network.
 * Uses NEXT_PUBLIC_STARKNET_RPC_URL env var (defaults to Blast API Sepolia).
 */
export function getProvider(): RpcProvider {
  const nodeUrl = process.env.NEXT_PUBLIC_STARKNET_RPC_URL ?? DEFAULT_RPC_URL;

  if (cachedProvider && cachedUrl === nodeUrl) {
    return cachedProvider;
  }

  cachedProvider = new RpcProvider({ nodeUrl });
  cachedUrl = nodeUrl;

  return cachedProvider;
}

/**
 * Calls a StarkNet contract view function and returns the result array.
 */
export async function callContract(
  address: string,
  entrypoint: string,
  calldata: string[] = [],
): Promise<string[]> {
  const provider = getProvider();
  const result = await provider.callContract({
    contractAddress: address,
    entrypoint,
    calldata,
  });
  return result;
}

/**
 * Waits for a transaction to be confirmed on-chain (ACCEPTED_ON_L2).
 * Call this after executeTransaction before invalidating queries.
 */
export async function waitForTx(txHash: string): Promise<void> {
  const provider = getProvider();
  await provider.waitForTransaction(txHash);
}

/**
 * Creates a Contract instance bound to the cached provider.
 */
export function getContract(address: string, abi: Abi): Contract {
  const provider = getProvider();
  return new Contract(abi, address, provider);
}
