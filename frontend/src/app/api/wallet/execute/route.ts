import { NextRequest, NextResponse } from "next/server";
import { CallData } from "starknet";
import { verifyAuth } from "../../_lib/auth";
import { getStarknetWallet, getReadyAccount } from "../../_lib/ready";

interface ContractCall {
  contractAddress: string;
  entrypoint: string;
  calldata?: unknown[] | Record<string, unknown>;
}

/**
 * POST /api/wallet/execute
 * Execute one or more contract calls using the Privy-backed Ready account.
 *
 * Body: {
 *   walletId: string,
 *   calls: ContractCall[],
 *   wait?: boolean
 * }
 * Returns: { transactionHash, address, walletId }
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
    const { walletId, calls, wait } = body;

    if (!walletId) {
      return NextResponse.json(
        { error: "walletId is required" },
        { status: 400 }
      );
    }

    if (!calls || !Array.isArray(calls) || calls.length === 0) {
      return NextResponse.json(
        { error: "calls array is required" },
        { status: 400 }
      );
    }

    const { publicKey } = await getStarknetWallet(walletId);
    const { account, address } = await getReadyAccount({
      walletId,
      publicKey,
      userJwt: auth.token,
    });

    // Normalize calls
    const normalizedCalls = (calls as ContractCall[]).map((c) => {
      if (!c.contractAddress || !c.entrypoint) {
        throw new Error("Each call must include contractAddress and entrypoint");
      }
      let calldata = c.calldata ?? [];
      if (calldata && !Array.isArray(calldata) && typeof calldata === "object") {
        calldata = CallData.compile(calldata as Parameters<typeof CallData.compile>[0]);
      }
      return {
        contractAddress: c.contractAddress,
        entrypoint: c.entrypoint,
        calldata: (calldata as string[]) || [],
      };
    });

    const result = (await account.execute(normalizedCalls)) as Record<
      string,
      unknown
    >;

    if (wait) {
      try {
        await account.waitForTransaction(
          result.transaction_hash as string
        );
      } catch {
        // Non-fatal: transaction may still succeed
      }
    }

    return NextResponse.json({
      walletId,
      address,
      transactionHash: result?.transaction_hash,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to execute transaction";
    console.error("Error executing transaction:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
