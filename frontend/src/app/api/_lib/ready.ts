/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Account,
  CallData,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
  hash,
} from "starknet";
import { getRpcProvider } from "./provider";
import { RawSigner } from "./rawSigner";
import { getPrivyClient } from "./privyClient";

function buildReadyConstructor(publicKey: string) {
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
 * Sign a message hash using the Privy Wallet API (raw_sign).
 */
export async function rawSign(
  walletId: string,
  messageHash: string,
  _opts: { userJwt: string }
): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing PRIVY_APP_ID or PRIVY_APP_SECRET");
  }

  const url = `https://api.privy.io/v1/wallets/${walletId}/raw_sign`;
  const body = { params: { hash: messageHash } };

  const headers: Record<string, string> = {
    "privy-app-id": appId,
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString(
      "base64"
    )}`,
  };

  // If we have a wallet auth key, build a P-256 ECDSA authorization signature
  const authKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY;
  if (authKey) {
    try {
      const crypto = await import("crypto");
      // The auth key should be a PEM-formatted P-256 private key
      const sign = crypto.createSign("SHA256");
      sign.update(JSON.stringify(body));
      sign.end();
      const signature = sign.sign(authKey, "base64");
      headers["privy-authorization-signature"] = signature;
    } catch (signErr) {
      console.warn("Failed to compute authorization signature:", signErr);
      // Continue without the signature — Privy will reject if it's required
    }
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text}`);
  }

  if (!resp.ok) {
    throw new Error(
      (data?.error as string) ||
        (data?.message as string) ||
        `HTTP ${resp.status}`
    );
  }

  const sig =
    (data?.signature as string) ||
    ((data?.result as Record<string, unknown>)?.signature as string) ||
    ((data?.data as Record<string, unknown>)?.signature as string);

  if (!sig || typeof sig !== "string") {
    throw new Error("No signature returned from Privy");
  }

  return sig.startsWith("0x") ? sig : `0x${sig}`;
}

/**
 * Build a starknet.js Account instance backed by Privy signing.
 */
export async function getReadyAccount(opts: {
  walletId: string;
  publicKey: string;
  userJwt: string;
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

  const { walletId, userJwt } = opts;

  const account = new Account(
    provider,
    address,
    new (class extends RawSigner {
      async signRaw(messageHash: string): Promise<[string, string]> {
        const sig = await rawSign(walletId, messageHash, { userJwt });
        const body = sig.slice(2);
        return [`0x${body.slice(0, 64)}`, `0x${body.slice(64)}`];
      }
    })()
  );

  return { account, address };
}

/**
 * Get a Starknet wallet's public key from Privy.
 */
export async function getStarknetWallet(walletId: string) {
  if (!walletId) throw new Error("walletId is required");
  const privy = getPrivyClient();
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
