import { RpcProvider, Contract } from 'starknet';
import type { Abi } from 'starknet';

const RPC_URLS: Record<string, string> = {
  sepolia: 'https://rpc.sepolia.voyager.online',
  mainnet: 'https://rpc.voyager.online',
};

let cachedProvider: RpcProvider | null = null;
let cachedNetwork: string | null = null;

/**
 * Returns a cached RpcProvider for the configured StarkNet network.
 * Uses NEXT_PUBLIC_STARKNET_NETWORK env var (defaults to "sepolia").
 */
export function getProvider(): RpcProvider {
  const network = process.env.NEXT_PUBLIC_STARKNET_NETWORK ?? 'sepolia';

  if (cachedProvider && cachedNetwork === network) {
    return cachedProvider;
  }

  const nodeUrl = RPC_URLS[network] ?? RPC_URLS.sepolia;
  cachedProvider = new RpcProvider({ nodeUrl });
  cachedNetwork = network;

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
 * Creates a Contract instance bound to the cached provider.
 */
export function getContract(address: string, abi: Abi): Contract {
  const provider = getProvider();
  return new Contract(abi, address, provider);
}
