export const ADDRESSES = {
  sepolia: {
    vault: "0x2b74b61014670ccde658d03505e15326a7d493bedec488b1e7f97d6aa12b882",
    manager: "0x460d2e1a5d6c0283de2e1fefddcf6ad9afb34f32ef050af68a294ef452a2cbf",
    ekuboStrategy: "0x6c0ba5081daf70b6fa0d58418d46403a8f1da4a28f215e5bd1b4864ae2c2b6f",
    vesuStrategy: "0x4e849f4f70c3bb2fb2c9c72511fd548f951a5f12b9345e089cd8a093de6f279",
    wbtc: "0x14cfad93c79be2f099b84748b7dbc9bbb7f81fccf4cba590711a6a8624c6291",
    usdc: "0x2977b4d253eb53ddbff6df4d49519d7e8c0fc9d5093b652bad0fcff1fe2d76b",
    oracle: "0x786ebf806c4cd158d58edc0486510daa9d43c573ea0ee8605720d21a2e447d",
    positions: "0x1186cbfee57254b5dc1521f9c290a16f5d997eee866614a8f8da8585d40c4ea",
    vesuPool: "0x4059d0614e27c6d4210fd6fe823dc3f9000c7b646d3c273ec443b70ff33e5e7",
    owner: "0x004c577a051a932c2d962d685540d39c0194717f8559d5e14a59d720cc918b08",
  },
} as const;

export type NetworkId = keyof typeof ADDRESSES;
export const DEFAULT_NETWORK: NetworkId = "sepolia";
