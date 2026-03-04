/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import {
  transaction,
  CallData,
  hash,
  stark,
  typedData,
  RPC,
  type CairoVersion,
  encode,
} from "starknet";
import { poseidonHashMany } from "@scure/starknet";

// ── Starknet 0.13.x fee-field hash ──────────────────────────────────
// starknet.js v6 only hashes [tip, L1_GAS, L2_GAS].
// Starknet 0.13.x requires [tip, L1_GAS, L2_GAS, L1_DATA_GAS].
// We re-implement the fee-field hash to include l1_data_gas.

const DATA_AVAILABILITY_MODE_BITS = 32n;
const MAX_AMOUNT_BITS = 64n;
const MAX_PRICE_PER_UNIT_BITS = 128n;
const RESOURCE_VALUE_OFFSET = MAX_AMOUNT_BITS + MAX_PRICE_PER_UNIT_BITS;

function shortStringToBigInt(s: string): bigint {
  let result = 0n;
  for (let i = 0; i < s.length; i++) {
    result = result * 256n + BigInt(s.charCodeAt(i));
  }
  return result;
}

const L1_GAS_NAME = shortStringToBigInt("L1_GAS");
const L2_GAS_NAME = shortStringToBigInt("L2_GAS");
const L1_DATA_GAS_NAME = shortStringToBigInt("L1_DATA");

function encodeResourceBound(
  name: bigint,
  maxAmount: string | bigint,
  maxPricePerUnit: string | bigint,
): bigint {
  return (
    (name << RESOURCE_VALUE_OFFSET) +
    (BigInt(maxAmount) << MAX_PRICE_PER_UNIT_BITS) +
    BigInt(maxPricePerUnit)
  );
}

function hashFeeField013(tip: string | bigint, bounds: any): bigint {
  const l1 = encodeResourceBound(
    L1_GAS_NAME,
    bounds.l1_gas.max_amount,
    bounds.l1_gas.max_price_per_unit,
  );
  const l2 = encodeResourceBound(
    L2_GAS_NAME,
    bounds.l2_gas.max_amount,
    bounds.l2_gas.max_price_per_unit,
  );

  // l1_data_gas — if not present, use zero (pre-0.13 compat)
  const l1dg = bounds.l1_data_gas;
  if (l1dg) {
    const l1d = encodeResourceBound(
      L1_DATA_GAS_NAME,
      l1dg.max_amount,
      l1dg.max_price_per_unit,
    );
    return poseidonHashMany([BigInt(tip), l1, l2, l1d]);
  }

  return poseidonHashMany([BigInt(tip), l1, l2]);
}

function hashDAMode(
  nonceDAMode: number | bigint,
  feeDAMode: number | bigint,
): bigint {
  return (
    (BigInt(nonceDAMode) << DATA_AVAILABILITY_MODE_BITS) + BigInt(feeDAMode)
  );
}

function toBigIntArray(arr: any[]): bigint[] {
  return arr.map((it) => BigInt(it));
}

/**
 * Re-implement V3 transaction hash with Starknet 0.13.x support.
 * The only difference from starknet.js v6 is that hashFeeField
 * includes l1_data_gas in the poseidon hash.
 */
function calcTxHashCommonV3_013(
  txHashPrefix: string,
  version: string,
  senderAddress: string,
  chainId: string,
  nonce: string | bigint,
  tip: string | bigint,
  paymasterData: any[],
  nonceDAMode: number | bigint,
  feeDAMode: number | bigint,
  resourceBounds: any,
  additionalData: (string | bigint)[] = [],
): string {
  const feeFieldHash = hashFeeField013(tip, resourceBounds);
  const dAModeHash = hashDAMode(nonceDAMode, feeDAMode);
  const dataToHash = toBigIntArray([
    txHashPrefix,
    version,
    senderAddress,
    feeFieldHash,
    poseidonHashMany(toBigIntArray(paymasterData)),
    chainId,
    nonce,
    dAModeHash,
    ...toBigIntArray(additionalData.map((x) => x.toString())),
  ]);
  return "0x" + poseidonHashMany(dataToHash).toString(16);
}

/**
 * Base raw signer for Privy integration.
 * Subclass must implement `signRaw(messageHash)` to perform actual signing
 * via the Privy Wallet API.
 *
 * Ported from starknet-edu/starknet-privy-demo with type adjustments
 * for starknet.js v6 compatibility + Starknet 0.13.x hash fix.
 */
export class RawSigner {
  async signRaw(_messageHash: string): Promise<[string, string]> {
    throw new Error("signRaw method must be implemented by subclass");
  }

  async getPubKey(): Promise<string> {
    throw new Error("This signer allows multiple public keys");
  }

  async signMessage(
    typed: any,
    accountAddress: string,
  ): Promise<[string, string]> {
    const messageHash = typedData.getMessageHash(typed, accountAddress);
    return this.signRaw(messageHash);
  }

  async signTransaction(
    transactions: any,
    details: any,
  ): Promise<[string, string]> {
    const compiledCalldata = transaction.getExecuteCalldata(
      transactions,
      details.cairoVersion as CairoVersion,
    );

    let msgHash: string;

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version)
    ) {
      msgHash = hash.calculateInvokeTransactionHash({
        ...details,
        senderAddress: details.walletAddress,
        compiledCalldata,
        version: details.version,
      } as any);
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version)
    ) {
      // Use Starknet 0.14.x-compatible hash that includes l1_data_gas
      msgHash = calcTxHashCommonV3_013(
        "0x696e766f6b65" /* INVOKE */,
        details.version,
        details.walletAddress,
        details.chainId,
        details.nonce,
        details.tip,
        details.paymasterData,
        stark.intDAM(details.nonceDataAvailabilityMode),
        stark.intDAM(details.feeDataAvailabilityMode),
        details.resourceBounds,
        // additionalData for invoke (Starknet 0.13.2+):
        // [H(account_deployment_data), H(calldata)]
        [
          poseidonHashMany(
            toBigIntArray(details.accountDeploymentData ?? []),
          ),
          poseidonHashMany(toBigIntArray(compiledCalldata)),
        ],
      );
      console.log("[RawSigner] invoke hash:", msgHash);
    } else {
      throw new Error("unsupported signTransaction version");
    }

    return this.signRaw(msgHash);
  }

  async signDeployAccountTransaction(
    details: any,
  ): Promise<[string, string]> {
    const compiledConstructorCalldata = CallData.compile(
      details.constructorCalldata,
    );

    let msgHash: string;

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version)
    ) {
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...details,
        salt: details.addressSalt,
        constructorCalldata: compiledConstructorCalldata,
        version: details.version,
      } as any);
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version)
    ) {
      // Debug: check what starknet.js passes to the signer
      console.log("[RawSigner] deploy details keys:", Object.keys(details));
      console.log("[RawSigner] resourceBounds:", JSON.stringify(details.resourceBounds));
      console.log("[RawSigner] contractAddress:", details.contractAddress);
      console.log("[RawSigner] chainId:", details.chainId);
      console.log("[RawSigner] nonce:", details.nonce);
      console.log("[RawSigner] tip:", details.tip);
      console.log("[RawSigner] classHash:", details.classHash);
      console.log("[RawSigner] addressSalt:", details.addressSalt);

      // Use 0.13.x-compatible hash that includes l1_data_gas
      msgHash = calcTxHashCommonV3_013(
        "0x6465706c6f795f6163636f756e74" /* DEPLOY_ACCOUNT */,
        details.version,
        details.contractAddress,
        details.chainId,
        details.nonce,
        details.tip,
        details.paymasterData ?? [],
        stark.intDAM(details.nonceDataAvailabilityMode),
        stark.intDAM(details.feeDataAvailabilityMode),
        details.resourceBounds,
        // additionalData for deploy_account: [H(constructor_calldata), class_hash, salt]
        [
          poseidonHashMany(toBigIntArray(compiledConstructorCalldata)),
          details.classHash,
          details.addressSalt,
        ],
      );
    } else {
      throw new Error("unsupported signDeployAccountTransaction version");
    }

    return this.signRaw(msgHash);
  }

  async signDeclareTransaction(details: any): Promise<[string, string]> {
    let msgHash: string;

    if (
      Object.values(RPC.ETransactionVersion2).includes(details.version)
    ) {
      msgHash = hash.calculateDeclareTransactionHash({
        ...details,
        version: details.version,
      } as any);
    } else if (
      Object.values(RPC.ETransactionVersion3).includes(details.version)
    ) {
      msgHash = hash.calculateDeclareTransactionHash({
        ...details,
        version: details.version,
        nonceDataAvailabilityMode: stark.intDAM(
          details.nonceDataAvailabilityMode,
        ),
        feeDataAvailabilityMode: stark.intDAM(
          details.feeDataAvailabilityMode,
        ),
      } as any);
    } else {
      throw new Error("unsupported signDeclareTransaction version");
    }

    return this.signRaw(msgHash);
  }
}
