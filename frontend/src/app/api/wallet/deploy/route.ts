import { NextRequest, NextResponse } from "next/server";
import { CallData, CairoOption, CairoOptionVariant, CairoCustomEnum } from "starknet";
import { verifyAuth } from "../../_lib/auth";
import { getStarknetWallet, getReadyAccount, computeReadyAddress } from "../../_lib/ready";

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

    const classHash = process.env.READY_CLASSHASH;
    if (!classHash) {
      return NextResponse.json(
        { error: "READY_CLASSHASH not configured" },
        { status: 500 }
      );
    }

    // Verify the authenticated user owns this wallet
    const { verifyWalletOwnership } = await import("../../_lib/ready");
    await verifyWalletOwnership(walletId, auth.userId);

    const { publicKey } = await getStarknetWallet(walletId);
    const address = computeReadyAddress(publicKey);

    const { account } = await getReadyAccount({
      walletId,
      publicKey,
    });

    // Build constructor calldata matching Ready account's expected params
    const signerEnum = new CairoCustomEnum({ Starknet: { pubkey: publicKey } });
    const guardian = new CairoOption(CairoOptionVariant.None);
    const constructorCalldata = CallData.compile({ owner: signerEnum, guardian });

    // Deploy account with proper constructor calldata
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
    if (msg.includes("does not belong")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
