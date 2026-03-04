// Minimal ABI for MockPragmaOracle — set_price only
// The contract is deployed on Sepolia at ADDRESSES.sepolia.oracle
export const ORACLE_ABI = [
  {
    type: "function",
    name: "set_price",
    inputs: [
      {
        name: "price",
        type: "core::integer::u128",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
] as const;
