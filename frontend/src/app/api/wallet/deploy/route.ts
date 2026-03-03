import { NextRequest, NextResponse } from "next/server";
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

    const { publicKey } = await getStarknetWallet(walletId);
    const address = computeReadyAddress(publicKey);

    const { account } = await getReadyAccount({
      walletId,
      publicKey,
      userJwt: auth.token,
    });

    // Deploy account by executing a self-transfer (activates the account)
    const result = await account.deployAccount({
      classHash,
      constructorCalldata: [],
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
