import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "../../_lib/auth";
import { rawSign } from "../../_lib/ready";

/**
 * POST /api/wallet/sign
 * Signs a message hash using Privy Wallet API.
 * Used by StarkZap PrivySigner as the server-side signing endpoint.
 *
 * Body: { walletId: string, hash: string }
 * Returns: { signature: string }
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
    const { walletId, hash: messageHash } = body;

    if (!walletId || !messageHash) {
      return NextResponse.json(
        { error: "walletId and hash are required" },
        { status: 400 }
      );
    }

    const signature = await rawSign(walletId, messageHash);

    return NextResponse.json({ signature });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to sign";
    console.error("Error signing:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
