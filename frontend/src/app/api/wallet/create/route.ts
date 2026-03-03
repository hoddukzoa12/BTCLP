import { NextRequest, NextResponse } from "next/server";
import { getPrivyClient } from "../../_lib/privyClient";
import { computeReadyAddress } from "../../_lib/ready";
import { verifyAuth } from "../../_lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    const body = await req.json();
    const ownerId = body?.ownerId || auth?.userId;

    const privy = getPrivyClient();

    const result = (await privy.walletApi.createWallet({
      chainType: "starknet",
      ...(ownerId ? { owner: { userId: ownerId } } : {}),
    } as Parameters<typeof privy.walletApi.createWallet>[0])) as Record<
      string,
      unknown
    >;

    const publicKey =
      (result.public_key as string) || (result.publicKey as string);
    const address = publicKey
      ? computeReadyAddress(publicKey)
      : (result.address as string);

    return NextResponse.json({
      walletId: result.id as string,
      walletAddress: address,
      publicKey,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create wallet";
    console.error("Error creating Privy wallet:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
