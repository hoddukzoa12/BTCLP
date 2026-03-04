import { NextRequest, NextResponse } from "next/server";
import { getPrivyWalletClient } from "../../_lib/privyClient";
import { computeReadyAddress, ensureAuthorizationKey } from "../../_lib/ready";
import { verifyAuth } from "../../_lib/auth";

/**
 * Extract wallet response fields from a Privy WalletApiWalletResponseType.
 *
 * The Privy SDK returns:
 *   { id, address, chainType, publicKey?, ownerId, ... }
 *
 * For Starknet wallets, `publicKey` is available. We derive the Ready account
 * address from the public key if possible, otherwise fall back to `address`.
 */
function extractWalletFields(wallet: Record<string, unknown>) {
  const publicKey =
    (wallet.publicKey as string | undefined) ||
    (wallet.public_key as string | undefined) ||
    "";
  const address = publicKey
    ? computeReadyAddress(publicKey)
    : (wallet.address as string);
  return {
    walletId: wallet.id as string,
    walletAddress: address,
    publicKey,
  };
}

/**
 * Fetch starknet wallets owned by a specific user via REST API.
 *
 * The SDK v1.32 `getWallets()` doesn't support userId filter, and its
 * `ownerId` field returns key quorum IDs (not `did:privy:...`), making
 * client-side filtering impossible. The REST API supports `user_id` param.
 */
async function getWalletsForUser(
  userId: string,
): Promise<Record<string, unknown>[]> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
  const appSecret = process.env.PRIVY_APP_SECRET!;

  const url = new URL("https://api.privy.io/v1/wallets");
  url.searchParams.set("chain_type", "starknet");
  url.searchParams.set("user_id", userId);

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "privy-app-id": appId,
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.warn("[wallet/create] REST getWallets failed:", resp.status, text.slice(0, 200));
    return [];
  }

  const json = await resp.json();
  return (json?.data as Record<string, unknown>[]) ?? [];
}

/**
 * Check if a wallet has a specific authorization key in additional_signers.
 */
function walletHasAuthKey(
  wallet: Record<string, unknown>,
  authKeyId: string,
): boolean {
  const signers = wallet.additional_signers as
    | Array<Record<string, unknown>>
    | undefined;
  if (!signers || !Array.isArray(signers)) return false;
  return signers.some((s) => s.signer_id === authKeyId);
}

/**
 * Create a Starknet wallet via REST API with proper additional_signers.
 *
 * The SDK v1.32 only supports Ethereum/Solana and silently drops Starknet-
 * specific parameters. We call the REST API directly to ensure the auth key
 * is linked at creation time via `additional_signers`.
 */
async function createStarknetWallet(
  ownerId: string | undefined,
  authKeyId: string | undefined,
): Promise<Record<string, unknown>> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
  const appSecret = process.env.PRIVY_APP_SECRET!;
  const authPrivateKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY;

  const url = "https://api.privy.io/v1/wallets";
  const body: Record<string, unknown> = {
    chain_type: "starknet",
  };
  if (ownerId) {
    body.owner = { user_id: ownerId };
  }
  if (authKeyId) {
    body.additional_signers = [{ signer_id: authKeyId }];
    console.log("[wallet/create] REST create with additional_signers:", [{ signer_id: authKeyId }]);
  } else {
    console.warn("[wallet/create] PRIVY_WALLET_AUTH_KEY_ID not set — wallet will have no authorization key");
  }

  const headers: Record<string, string> = {
    "privy-app-id": appId,
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
  };

  // Add authorization signature if private key is available
  if (authPrivateKey) {
    const { generateAuthorizationSignature } = await import(
      "@privy-io/server-auth/wallet-api"
    );
    const authSig = generateAuthorizationSignature({
      input: {
        version: 1,
        method: "POST",
        url,
        body,
        headers: { "privy-app-id": appId },
      },
      authorizationPrivateKey: authPrivateKey,
    });
    if (authSig) {
      headers["privy-authorization-signature"] = authSig;
    }
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error("[wallet/create] REST create failed:", resp.status, text.slice(0, 500));
    throw new Error(`Failed to create wallet: ${resp.status} ${text}`);
  }

  const wallet = JSON.parse(text) as Record<string, unknown>;
  console.log(
    "[wallet/create] REST create response — id:", wallet.id,
    "additional_signers:", JSON.stringify(wallet.additional_signers)
  );
  return wallet;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const ownerId = auth.userId;

    const privy = getPrivyWalletClient();
    const authKeyId = process.env.PRIVY_WALLET_AUTH_KEY_ID;

    // ── 1. REST API: find server wallets owned by this user ──
    // SDK v1.32 getWallets() can't filter by userId and returns key quorum IDs
    // as ownerId, so we use the REST API directly with user_id parameter.
    if (ownerId) {
      try {
        const userWallets = await getWalletsForUser(ownerId);
        console.log(
          "[wallet/create] REST getWallets for user returned",
          userWallets.length,
          "starknet wallets"
        );

        if (userWallets.length > 0 && authKeyId) {
          // Only use a wallet that already has our authorization key.
          // Wallets without auth keys (e.g. created by older SDK) can't sign.
          const best = userWallets.find((w) => walletHasAuthKey(w, authKeyId));

          if (best) {
            console.log(
              "[wallet/create] Found wallet with auth key for",
              ownerId,
              "→ id:",
              best.id
            );
            return NextResponse.json(extractWalletFields(best));
          }

          console.log(
            "[wallet/create]",
            userWallets.length,
            "wallets found but none have auth key",
            authKeyId,
            "— will create new"
          );
        }
      } catch (e) {
        console.warn("[wallet/create] REST wallet lookup failed:", e);
      }

      // ── 2. Fallback: check linkedAccounts for a server wallet ──
      // linkedAccounts may contain embedded wallets that DON'T support
      // authorization keys. We only use a wallet from here if we can
      // successfully link our auth key to it.
      try {
        const user = await privy.getUser(ownerId);
        const linked = user?.linkedAccounts;

        if (linked && Array.isArray(linked)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const starknetWallet = linked.find((a: any) =>
            a.type === "wallet" && a.chainType === "starknet"
          );

          if (starknetWallet) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = starknetWallet as any;
            const linkedId = w.id as string | undefined;

            console.log(
              "[wallet/create] Found starknet wallet in linkedAccounts for",
              ownerId,
              "→ id:", linkedId, "address:", w.address
            );

            // Only use if we have a real Privy wallet ID (not a hex address)
            if (linkedId && !linkedId.startsWith("0x")) {
              try {
                const fullWallet = await privy.walletApi.getWallet({ id: linkedId });

                // Try to link auth key — if this fails, the wallet is an
                // embedded wallet that can't do server-side signing.
                const authOk = await ensureAuthorizationKey(linkedId);
                if (!authOk) {
                  console.warn(
                    "[wallet/create] linkedAccounts wallet has no auth key support — skipping",
                    linkedId
                  );
                  // Fall through to Path 3
                } else {
                  console.log("[wallet/create] linkedAccounts wallet usable:", linkedId);
                  return NextResponse.json(
                    extractWalletFields(fullWallet as Record<string, unknown>)
                  );
                }
              } catch (e) {
                console.warn(
                  "[wallet/create] linkedAccounts wallet unusable:", e
                );
                // Fall through to Path 3
              }
            }
          }
        }
      } catch (e) {
        console.warn("[wallet/create] getUser lookup failed:", e);
      }
    }

    // ── 3. No usable wallet found — create new server wallet via REST API ──
    // SDK v1.32 doesn't support Starknet natively (0 references in source),
    // so authorizationKeyIds may be silently dropped. Use REST API directly.
    console.log("[wallet/create] Creating NEW Starknet server wallet for", ownerId);

    const createResult = await createStarknetWallet(ownerId, authKeyId);
    const fields = extractWalletFields(createResult);
    console.log("[wallet/create] Created wallet:", fields.walletId, "→", fields.walletAddress);

    return NextResponse.json(fields);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to create wallet";
    console.error("[wallet/create] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
