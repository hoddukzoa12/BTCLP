import { PrivyClient } from "@privy-io/server-auth";

let client: PrivyClient | undefined;

export function getPrivyClient(): PrivyClient {
  if (client) return client;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET");
  }

  client = new PrivyClient(appId, appSecret);

  const authKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY;
  if (authKey) {
    try {
      client.walletApi.updateAuthorizationKey(authKey);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Failed to set Privy wallet authorization key:", msg);
    }
  }

  return client;
}
