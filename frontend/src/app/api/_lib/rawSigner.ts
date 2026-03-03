/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import {
  transaction,
  CallData,
  hash,
  stark,
  typedData,
  RPC,
  type CairoVersion,
} from "starknet";

/**
 * Base raw signer for Privy integration.
 * Subclass must implement `signRaw(messageHash)` to perform actual signing
 * via the Privy Wallet API.
 *
 * Ported from starknet-edu/starknet-privy-demo with type adjustments
 * for starknet.js v6 compatibility.
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
    accountAddress: string
  ): Promise<[string, string]> {
    const messageHash = typedData.getMessageHash(typed, accountAddress);
    return this.signRaw(messageHash);
  }

  async signTransaction(
    transactions: any,
    details: any
  ): Promise<[string, string]> {
    const compiledCalldata = transaction.getExecuteCalldata(
      transactions,
      details.cairoVersion as CairoVersion
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
      msgHash = hash.calculateInvokeTransactionHash({
        ...details,
        senderAddress: details.walletAddress,
        compiledCalldata,
        version: details.version,
        nonceDataAvailabilityMode: stark.intDAM(
          details.nonceDataAvailabilityMode
        ),
        feeDataAvailabilityMode: stark.intDAM(
          details.feeDataAvailabilityMode
        ),
      } as any);
    } else {
      throw new Error("unsupported signTransaction version");
    }

    return this.signRaw(msgHash);
  }

  async signDeployAccountTransaction(
    details: any
  ): Promise<[string, string]> {
    const compiledConstructorCalldata = CallData.compile(
      details.constructorCalldata
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
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...details,
        salt: details.addressSalt,
        compiledConstructorCalldata,
        version: details.version,
        nonceDataAvailabilityMode: stark.intDAM(
          details.nonceDataAvailabilityMode
        ),
        feeDataAvailabilityMode: stark.intDAM(
          details.feeDataAvailabilityMode
        ),
      } as any);
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
          details.nonceDataAvailabilityMode
        ),
        feeDataAvailabilityMode: stark.intDAM(
          details.feeDataAvailabilityMode
        ),
      } as any);
    } else {
      throw new Error("unsupported signDeclareTransaction version");
    }

    return this.signRaw(msgHash);
  }
}
