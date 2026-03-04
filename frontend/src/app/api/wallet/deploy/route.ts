import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "../../_lib/auth";
import { getReadyAccount, computeReadyAddress, buildReadyConstructor, verifyWalletOwnership, validateWalletId } from "../../_lib/ready";
import { getRpcProvider } from "../../_lib/provider";

/**
 * Check if account is already deployed on-chain.
 */
async function isAccountDeployed(address: string): Promise<boolean> {
  try {
    const provider = getRpcProvider();
    await provider.getNonceForAddress(address);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Contract not found") || msg.includes("not found")) {
      return false;
    }
    throw new Error(`RPC error checking deployment: ${msg}`);
  }
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
    const { walletId } = body;
    if (!walletId) {
      return NextResponse.json(
        { error: "walletId is required" },
        { status: 400 }
      );
    }

    validateWalletId(walletId);

    const classHash = process.env.READY_CLASSHASH;
    if (!classHash) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Verify the authenticated user owns this wallet (also returns wallet data)
    const { publicKey } = await verifyWalletOwnership(walletId, auth.userId);
    const address = computeReadyAddress(publicKey);

    // Idempotency: skip if already deployed
    const deployed = await isAccountDeployed(address);
    if (deployed) {
      return NextResponse.json({
        walletId,
        address,
        publicKey,
        alreadyDeployed: true,
      });
    }

    const { account } = await getReadyAccount({
      walletId,
      publicKey,
    });

    const constructorCalldata = buildReadyConstructor(publicKey);

    const result = await account.deployAccount({
      classHash,
      constructorCalldata,
      addressSalt: publicKey,
    });

    return NextResponse.json({
      walletId,
      address,
      publicKey,
      transactionHash: result?.transaction_hash,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to deploy wallet";
    console.error("Error deploying Ready account:", msg);
    if (msg.includes("does not belong") || msg.includes("Invalid walletId")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
