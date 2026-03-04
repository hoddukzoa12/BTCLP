import { NextRequest, NextResponse } from "next/server";
import {
  CallData,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
} from "starknet";
import { verifyAuth } from "../../_lib/auth";
import {
  getStarknetWallet,
  getReadyAccount,
  computeReadyAddress,
} from "../../_lib/ready";
import { getRpcProvider } from "../../_lib/provider";

interface ContractCall {
  contractAddress: string;
  entrypoint: string;
  calldata?: unknown[] | Record<string, unknown>;
}

/**
 * Check if a contract is deployed on-chain by querying its nonce.
 * Returns true if the contract exists, false otherwise.
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
    // Other errors (e.g., RPC failure) — assume not deployed to be safe
    console.warn("[execute] getNonce check failed:", msg);
    return false;
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

    // Verify the authenticated user owns this wallet
    const { verifyWalletOwnership } = await import("../../_lib/ready");
    await verifyWalletOwnership(walletId, auth.userId);

    const { publicKey } = await getStarknetWallet(walletId);
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
          { error: "READY_CLASSHASH not configured — cannot auto-deploy" },
          { status: 500 }
        );
      }

      const signerEnum = new CairoCustomEnum({
        Starknet: { pubkey: publicKey },
      });
      const guardian = new CairoOption(CairoOptionVariant.None);
      const constructorCalldata = CallData.compile({
        owner: signerEnum,
        guardian,
      });

      try {
        // Fetch current gas prices from the network to set proper bounds.
        // Hardcoded values break because Sepolia gas prices fluctuate widely.
        const provider = getRpcProvider();
        const block = await provider.getBlock("latest");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blockAny = block as any;
        const l1Price = BigInt(blockAny.l1_gas_price?.price_in_fri ?? "0x174876e800");
        const l1DataPrice = BigInt(blockAny.l1_data_gas_price?.price_in_fri ?? "0x174876e800");
        const l2Price = BigInt(blockAny.l2_gas_price?.price_in_fri ?? "0x174876e800");

        // 3x multiplier for safety margin
        const toHex = (n: bigint) => "0x" + n.toString(16);
        const l1PriceHex = toHex(l1Price * 3n);
        const l1DataPriceHex = toHex(l1DataPrice * 3n);
        const l2PriceHex = toHex(l2Price * 3n);

        console.log("[execute] Gas prices from block — l1:", l1Price.toString(), "l1_data:", l1DataPrice.toString(), "l2:", l2Price.toString());

        const deployResult = await account.deployAccount(
          {
            classHash,
            constructorCalldata,
            addressSalt: publicKey,
          },
          {
            // Starknet 0.13.x requires l1_data_gas in resource_bounds.
            // starknet.js v6 types don't include it yet, so we cast.
            resourceBounds: {
              l1_gas: { max_amount: "0x2710", max_price_per_unit: l1PriceHex },
              l2_gas: { max_amount: "0x1000000", max_price_per_unit: l2PriceHex },
              l1_data_gas: { max_amount: "0x2710", max_price_per_unit: l1DataPriceHex },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }
        );
        console.log(
          "[execute] Deploy tx:",
          deployResult?.transaction_hash
        );

        // Wait for deploy to confirm before executing the actual transaction
        await account.waitForTransaction(
          deployResult.transaction_hash as string
        );
        console.log("[execute] Deploy confirmed");
        deployed = true;
      } catch (deployErr: unknown) {
        console.error("[execute] Full deploy error:", deployErr);
        const deployMsg =
          deployErr instanceof Error
            ? deployErr.message
            : "Deploy failed";

        // If the error indicates the account is already deployed, continue
        if (
          deployMsg.includes("already deployed") ||
          deployMsg.includes("CONTRACT_ALREADY_DEPLOYED")
        ) {
          console.log("[execute] Account was already deployed (race condition)");
          deployed = true;
        } else {
          console.error("[execute] Auto-deploy failed:", deployMsg);
          return NextResponse.json(
            {
              error: `Account not deployed and auto-deploy failed: ${deployMsg}`,
            },
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

    // Fetch current gas prices for invoke tx resource bounds.
    // starknet.js v6 fee estimation omits l1_data_gas, causing RPC errors
    // on Starknet 0.14.x nodes. We provide explicit bounds instead.
    const invokeProvider = getRpcProvider();
    const invokeBlock = await invokeProvider.getBlock("latest");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ibAny = invokeBlock as any;
    const il1Price = BigInt(ibAny.l1_gas_price?.price_in_fri ?? "0x174876e800");
    const il1DataPrice = BigInt(ibAny.l1_data_gas_price?.price_in_fri ?? "0x174876e800");
    const il2Price = BigInt(ibAny.l2_gas_price?.price_in_fri ?? "0x174876e800");
    const iToHex = (n: bigint) => "0x" + n.toString(16);

    const result = (await account.execute(normalizedCalls, {
      resourceBounds: {
        l1_gas: { max_amount: "0x2710", max_price_per_unit: iToHex(il1Price * 3n) },
        l2_gas: { max_amount: "0x1000000", max_price_per_unit: iToHex(il2Price * 3n) },
        l1_data_gas: { max_amount: "0x2710", max_price_per_unit: iToHex(il1DataPrice * 3n) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
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
    if (msg.includes("does not belong")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
