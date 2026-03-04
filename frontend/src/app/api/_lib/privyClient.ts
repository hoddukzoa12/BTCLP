import { PrivyClient } from "@privy-io/server-auth";

/**
 * Core PrivyClient used ONLY for auth token verification.
 * Never has wallet authorization keys applied.
 */
let authClient: PrivyClient | undefined;

/**
 * Separate PrivyClient used for Wallet API operations.
 * Configured with authorizationPrivateKey so the SDK automatically
 * signs all wallet RPC requests (privy-authorization-signature header).
 */
let walletClient: PrivyClient | undefined;

function ensureEnv() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET");
  }
  return { appId, appSecret };
}

/**
 * Get a clean PrivyClient for auth verification (verifyAuthToken).
 */
export function getPrivyClient(): PrivyClient {
  if (authClient) return authClient;
  const { appId, appSecret } = ensureEnv();
  authClient = new PrivyClient(appId, appSecret);
  return authClient;
}

/**
 * Get a PrivyClient for Wallet API operations (getWallet, getWallets, createWallet, raw_sign, etc.).
 *
 * If PRIVY_WALLET_AUTH_PRIVATE_KEY is set, the SDK will automatically
 * include privy-authorization-signature on all wallet API requests.
 */
export function getPrivyWalletClient(): PrivyClient {
  if (walletClient) return walletClient;
  const { appId, appSecret } = ensureEnv();

  const authPrivateKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY;

  walletClient = new PrivyClient(appId, appSecret, {
    walletApi: {
      ...(authPrivateKey ? { authorizationPrivateKey: authPrivateKey } : {}),
    },
  });

  if (authPrivateKey) {
    console.log("[privyClient] Wallet client initialized WITH authorization key");
  } else {
    console.warn("[privyClient] Wallet client initialized WITHOUT authorization key");
  }

  return walletClient;
}
