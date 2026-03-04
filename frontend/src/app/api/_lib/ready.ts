/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Account,
  CallData,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
  hash,
  RPC,
} from "starknet";
import { getRpcProvider } from "./provider";
import { RawSigner } from "./rawSigner";
import { getPrivyWalletClient } from "./privyClient";

const WALLET_ID_RE = /^[a-zA-Z0-9_-]+$/;
const HEX_RE = /^0x[0-9a-fA-F]+$/;

/** Validate a Privy wallet ID to prevent URL injection. */
export function validateWalletId(walletId: string): void {
  if (!walletId || !WALLET_ID_RE.test(walletId)) {
    throw new Error("Invalid walletId format");
  }
}

/** Validate a Starknet hex hash string. */
export function validateHex(value: string, fieldName: string): void {
  if (!value || !HEX_RE.test(value)) {
    throw new Error(`Invalid ${fieldName} format`);
  }
}

export function buildReadyConstructor(publicKey: string) {
  const signerEnum = new CairoCustomEnum({ Starknet: { pubkey: publicKey } });
  const guardian = new CairoOption(CairoOptionVariant.None);
  return CallData.compile({ owner: signerEnum, guardian });
}

/**
 * Compute the Ready account address for a given public key.
 */
export function computeReadyAddress(publicKey: string): string {
  const classHash = process.env.READY_CLASSHASH;
  if (!classHash) throw new Error("Missing READY_CLASSHASH env");

  const calldata = buildReadyConstructor(publicKey);
  return hash.calculateContractAddressFromHash(
    publicKey,
    classHash,
    calldata,
    0
  );
}

/**
 * Track which wallets have already been patched with the authorization key
 * during this server process lifetime (avoids redundant PATCH calls).
 */
const patchedWallets = new Set<string>();

/**
 * Ensure an authorization key (signer) is linked to a wallet via PATCH API.
 * Called once per wallet per server process lifetime.
 */
export async function ensureAuthorizationKey(walletId: string): Promise<boolean> {
  const authKeyId = process.env.PRIVY_WALLET_AUTH_KEY_ID;
  const authPrivateKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY;
  if (!authKeyId) return true; // no key configured — assume OK
  if (patchedWallets.has(walletId)) return true; // already patched

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
  const appSecret = process.env.PRIVY_APP_SECRET!;

  const url = `https://api.privy.io/v1/wallets/${walletId}`;
  const body = {
    additional_signers: [{ signer_id: authKeyId }],
  };

  console.log("[ensureAuthorizationKey] PATCH", url, "signer_id:", authKeyId);

  // Privy requires privy-authorization-signature for PATCH on wallets with owner_id
  const headers: Record<string, string> = {
    "privy-app-id": appId,
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
  };

  if (authPrivateKey) {
    const { generateAuthorizationSignature } = await import(
      "@privy-io/server-auth/wallet-api"
    );
    const authSig = generateAuthorizationSignature({
      input: {
        version: 1,
        method: "PATCH",
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
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });

  if (resp.ok) {
    patchedWallets.add(walletId);
    console.log("[ensureAuthorizationKey] ✓ Key linked to wallet", walletId);
    return true;
  } else {
    const text = await resp.text();
    console.warn("[ensureAuthorizationKey] PATCH failed:", resp.status, text.slice(0, 300));
    return false;
  }
}

/**
 * Sign a message hash using the Privy Wallet API (raw_sign).
 */
export async function rawSign(
  walletId: string,
  messageHash: string,
): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const authPrivateKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY;

  if (!appId || !appSecret) {
    throw new Error("Missing PRIVY_APP_ID or PRIVY_APP_SECRET");
  }
  if (!authPrivateKey) {
    throw new Error(
      "Missing PRIVY_WALLET_AUTH_PRIVATE_KEY — required for Starknet raw_sign"
    );
  }

  // Ensure the authorization key is linked to this wallet before signing
  await ensureAuthorizationKey(walletId);

  const url = `https://api.privy.io/v1/wallets/${walletId}/raw_sign`;
  const body = {
    params: { hash: messageHash },
  };

  // Generate the authorization signature using the SDK's official function
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

  const headers: Record<string, string> = {
    "privy-app-id": appId,
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
  };
  if (authSig) {
    headers["privy-authorization-signature"] = authSig;
  }

  console.log("[rawSign] POST", url, "wallet:", walletId);

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  console.log("[rawSign] response status:", resp.status, "body:", text.slice(0, 500));

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from Privy: ${text}`);
  }

  if (!resp.ok) {
    throw new Error(
      (data?.error as string) ||
        (data?.message as string) ||
        `Privy raw_sign HTTP ${resp.status}`
    );
  }

  // Extract signature from various response shapes
  const sig =
    (data?.signature as string) ||
    ((data?.data as Record<string, unknown>)?.signature as string) ||
    ((data?.result as Record<string, unknown>)?.signature as string);

  if (!sig || typeof sig !== "string") {
    throw new Error(
      `No signature in Privy response: ${JSON.stringify(data)}`
    );
  }

  return sig.startsWith("0x") ? sig : `0x${sig}`;
}

/**
 * Build a starknet.js Account instance backed by Privy signing.
 */
export async function getReadyAccount(opts: {
  walletId: string;
  publicKey: string;
}): Promise<{ account: Account; address: string }> {
  const classHash = process.env.READY_CLASSHASH;
  if (!classHash) throw new Error("Missing READY_CLASSHASH env");

  const provider = getRpcProvider();
  const constructorCalldata = buildReadyConstructor(opts.publicKey);
  const address = hash.calculateContractAddressFromHash(
    opts.publicKey,
    classHash,
    constructorCalldata,
    0
  );

  const { walletId } = opts;

  const account = new Account(
    provider,
    address,
    new (class extends RawSigner {
      async signRaw(messageHash: string): Promise<[string, string]> {
        console.log("[RawSigner] signRaw called, messageHash:", messageHash);
        const sig = await rawSign(walletId, messageHash);
        console.log("[RawSigner] rawSign returned:", sig);
        const body = sig.slice(2);
        const r = `0x${body.slice(0, 64)}`;
        const s = `0x${body.slice(64)}`;
        console.log("[RawSigner] parsed r:", r, "s:", s);
        return [r, s];
      }
    })(),
    "1", // cairoVersion — Ready/Argent account is Cairo 1
    RPC.ETransactionVersion.V3 // Use V3 transactions (STRK fee token)
  );

  return { account, address };
}

/**
 * Verify that a wallet belongs to the given user.
 *
 * Privy's `owner_id` field is a key quorum ID, not the user's `did:privy:...`.
 * So we list all wallets for the user via `GET /v1/wallets?user_id=...` and
 * check if the requested walletId is in that list.
 */
/**
 * Wallet data returned from ownership verification.
 * Contains the public_key needed by downstream callers,
 * eliminating a second Privy API call to getStarknetWallet.
 */
export interface VerifiedWallet {
  publicKey: string;
  address?: string;
}

export async function verifyWalletOwnership(
  walletId: string,
  userId: string,
): Promise<VerifiedWallet> {
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
    throw new Error("Failed to verify wallet ownership");
  }

  const json = await resp.json();
  const wallets = (json?.data as Record<string, unknown>[]) ?? [];
  const match = wallets.find((w) => w.id === walletId);

  if (!match) {
    throw new Error("Wallet does not belong to authenticated user");
  }

  const publicKey =
    (match.public_key as string) || (match.publicKey as string) || "";
  if (!publicKey) {
    throw new Error("Wallet missing Starknet public key");
  }

  return { publicKey, address: match.address as string | undefined };
}

/**
 * Get a Starknet wallet's public key from Privy.
 */
export async function getStarknetWallet(walletId: string) {
  if (!walletId) throw new Error("walletId is required");
  const privy = getPrivyWalletClient();
  const wallet = (await privy.walletApi.getWallet({
    id: walletId,
  })) as Record<string, unknown>;

  const chainType =
    (wallet?.chainType as string) || (wallet?.chain_type as string);
  if (!wallet || chainType !== "starknet") {
    throw new Error("Provided wallet is not a Starknet wallet");
  }

  const publicKey =
    (wallet.public_key as string) || (wallet.publicKey as string);
  if (!publicKey) throw new Error("Wallet missing Starknet public key");

  const address = wallet.address as string | undefined;
  return { publicKey, address, chainType, wallet };
}
