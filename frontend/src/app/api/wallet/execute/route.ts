import { NextRequest, NextResponse } from "next/server";
import { CallData } from "starknet";
import { verifyAuth } from "../../_lib/auth";
import {
  getReadyAccount,
  computeReadyAddress,
  buildReadyConstructor,
  verifyWalletOwnership,
  validateWalletId,
} from "../../_lib/ready";
import { getRpcProvider, getResourceBounds } from "../../_lib/provider";

interface ContractCall {
  contractAddress: string;
  entrypoint: string;
  calldata?: unknown[] | Record<string, unknown>;
}

/**
 * Check if a contract is deployed on-chain by querying its nonce.
 * Throws on RPC errors (only returns false for "not found").
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

/**
 * POST /api/wallet/execute
 * Execute one or more contract calls using the Privy-backed Ready account.
 *
 * If the account has not been deployed yet, it will auto-deploy first.
 *
 * Body: {
 *   walletId: string,
 *   calls: ContractCall[],
 *   wait?: boolean
 * }
 * Returns: { transactionHash, address, walletId, deployed? }
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

    validateWalletId(walletId);

    // Verify the authenticated user owns this wallet (also returns wallet data)
    const { publicKey } = await verifyWalletOwnership(walletId, auth.userId);
    const address = computeReadyAddress(publicKey);
    const { account } = await getReadyAccount({
      walletId,
      publicKey,
    });

    // ── Auto-deploy if account doesn't exist on-chain ──
    let deployed = false;
    const isDeployed = await isAccountDeployed(address);
    if (!isDeployed) {
      console.log("[execute] Account not deployed, auto-deploying:", address);

      const classHash = process.env.READY_CLASSHASH;
      if (!classHash) {
        return NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        );
      }

      const constructorCalldata = buildReadyConstructor(publicKey);

      try {
        const resourceBounds = await getResourceBounds();

        const deployResult = await account.deployAccount(
          {
            classHash,
            constructorCalldata,
            addressSalt: publicKey,
          },
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resourceBounds: resourceBounds as any,
          }
        );
        console.log("[execute] Deploy tx:", deployResult?.transaction_hash);

        await account.waitForTransaction(
          deployResult.transaction_hash as string
        );
        console.log("[execute] Deploy confirmed");
        deployed = true;
      } catch (deployErr: unknown) {
        const deployMsg =
          deployErr instanceof Error
            ? deployErr.message
            : "Deploy failed";

        if (
          deployMsg.includes("already deployed") ||
          deployMsg.includes("CONTRACT_ALREADY_DEPLOYED")
        ) {
          console.log("[execute] Account was already deployed (race condition)");
          deployed = true;
        } else {
          console.error("[execute] Auto-deploy failed:", deployMsg);
          return NextResponse.json(
            { error: "Auto-deploy failed" },
            { status: 500 }
          );
        }
      }
    }

    // ── Normalize and execute calls ──
    const normalizedCalls = (calls as ContractCall[]).map((c) => {
      if (!c.contractAddress || !c.entrypoint) {
        throw new Error(
          "Each call must include contractAddress and entrypoint"
        );
      }
      let calldata = c.calldata ?? [];
      if (
        calldata &&
        !Array.isArray(calldata) &&
        typeof calldata === "object"
      ) {
        calldata = CallData.compile(
          calldata as Parameters<typeof CallData.compile>[0]
        );
      }
      return {
        contractAddress: c.contractAddress,
        entrypoint: c.entrypoint,
        calldata: (calldata as string[]) || [],
      };
    });

    const resourceBounds = await getResourceBounds();

    const result = (await account.execute(normalizedCalls, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resourceBounds: resourceBounds as any,
    })) as Record<string, unknown>;

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
      ...(deployed ? { deployed: true } : {}),
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to execute transaction";
    console.error("[execute] Error:", msg);
    if (msg.includes("does not belong") || msg.includes("Invalid walletId")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
