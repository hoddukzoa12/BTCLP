import { NextRequest, NextResponse } from "next/server";
import { Account, ec, RPC } from "starknet";
import { ADDRESSES } from "@/lib/addresses";
import { ORACLE_DECIMALS } from "@/lib/constants";
import { getRpcProvider, getResourceBounds } from "../../_lib/provider";
import { RawSigner } from "../../_lib/rawSigner";

const DEPLOYER_ADDR = ADDRESSES.sepolia.owner;
const ORACLE_ADDR = ADDRESSES.sepolia.oracle;
const MANAGER_ADDR = ADDRESSES.sepolia.manager;

/**
 * RawSigner subclass that signs locally with the deployer's private key.
 * Uses the same l1_data_gas-aware hash from RawSigner (Starknet 0.13.x fix).
 */
class DeployerSigner extends RawSigner {
  private pk: string;

  constructor(pk: string) {
    super();
    this.pk = pk;
  }

  async signRaw(messageHash: string): Promise<[string, string]> {
    const sig = ec.starkCurve.sign(messageHash, this.pk);
    return [
      "0x" + sig.r.toString(16),
      "0x" + sig.s.toString(16),
    ];
  }

  async getPubKey(): Promise<string> {
    return ec.starkCurve.getStarkKey(this.pk);
  }
}

function getDeployerAccount(): Account {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    throw new Error("DEPLOYER_PRIVATE_KEY not configured");
  }

  const provider = getRpcProvider();
  const signer = new DeployerSigner(pk);

  return new Account(
    provider,
    DEPLOYER_ADDR,
    signer as unknown as string, // RawSigner implements SignerInterface
    "1",
    RPC.ETransactionVersion.V3,
  );
}

/**
 * POST /api/oracle/demo-rebalance
 *
 * Sets the mock oracle price and triggers rebalance using the deployer account.
 * This bypasses the keeper_or_owner check since the deployer IS the owner.
 *
 * Body: { priceUsd: number }
 * Returns: { setPriceTxHash, rebalanceTxHash? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { priceUsd } = body;

    if (typeof priceUsd !== "number" || priceUsd <= 0 || priceUsd > 1_000_000) {
      return NextResponse.json(
        { error: "priceUsd must be a positive number (max 1,000,000)" },
        { status: 400 },
      );
    }

    const account = getDeployerAccount();
    const resourceBounds = await getResourceBounds();

    // Encode price: USD * 10^ORACLE_DECIMALS as u128 (single felt)
    const oraclePrice = BigInt(Math.round(priceUsd)) * BigInt(10 ** ORACLE_DECIMALS);

    // Step 1: set_price on oracle
    const setPriceResult = await account.execute(
      [
        {
          contractAddress: ORACLE_ADDR,
          entrypoint: "set_price",
          calldata: [oraclePrice.toString()],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { resourceBounds: resourceBounds as any },
    );

    await account.waitForTransaction(
      setPriceResult.transaction_hash as string,
    );

    // Step 2: try rebalance (may fail if vault is empty — that's OK)
    let rebalanceTxHash: string | null = null;
    try {
      const rb2 = await getResourceBounds();
      const rebalanceResult = await account.execute(
        [
          {
            contractAddress: MANAGER_ADDR,
            entrypoint: "rebalance",
            calldata: [],
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { resourceBounds: rb2 as any },
      );

      await account.waitForTransaction(
        rebalanceResult.transaction_hash as string,
      );
      rebalanceTxHash = rebalanceResult.transaction_hash as string;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[demo-rebalance] Rebalance skipped:", msg);
    }

    return NextResponse.json({
      setPriceTxHash: setPriceResult.transaction_hash,
      rebalanceTxHash,
      priceUsd,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed";
    console.error("[demo-rebalance] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
