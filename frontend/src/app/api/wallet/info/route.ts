import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "../../_lib/auth";
import { computeReadyAddress, verifyWalletOwnership, validateWalletId } from "../../_lib/ready";

/**
 * POST /api/wallet/info
 * Get wallet public key and computed address.
 *
 * Body: { walletId: string }
 * Returns: { walletId, publicKey, address }
 */
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

    // Verify the authenticated user owns this wallet (also returns wallet data)
    const { publicKey } = await verifyWalletOwnership(walletId, auth.userId);
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

    if (msg.includes("does not belong")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
