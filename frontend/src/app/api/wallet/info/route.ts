import { NextRequest, NextResponse } from "next/server";
import { getStarknetWallet, computeReadyAddress } from "../../_lib/ready";

/**
 * POST /api/wallet/info
 * Get wallet public key and computed address.
 *
 * Body: { walletId: string }
 * Returns: { walletId, publicKey, address }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletId } = body;

    if (!walletId) {
      return NextResponse.json(
        { error: "walletId is required" },
        { status: 400 }
      );
    }

    const { publicKey } = await getStarknetWallet(walletId);
    const address = computeReadyAddress(publicKey);

    return NextResponse.json({
      walletId,
      publicKey,
      address,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to get wallet info";
    console.error("Error fetching wallet info:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
