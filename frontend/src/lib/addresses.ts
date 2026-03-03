export const ADDRESSES = {
  sepolia: {
    vault: "0x0239c97b2771548702b4462122d6fdbb9f6d4ab66865c6c30fcd758524a91848",
    manager: "0x00d94b1f41f882376e9f65932bfb6d3abe3282a7995d745e5d85446055386792",
    ekuboStrategy: "0x0766ba0fc52c3b28088d139f239e883a8abc7fc75f71dec0af029f082dc9111a",
    vesuStrategy: "0x03583b0482ab227e20b3a452f8d3daea720fe74e2f4788180e17d1755a0d620b",
    wbtc: "0x0177e83c0a28698daf5f65cfd4923d75513eb8175fa76d110bb92133afb2d627",
    usdc: "0x07dd53abf7295d27c8db4ae802fb92d714b26521834ce4e6fcdf98d110c9cf9f",
    oracle: "0x03f794ee9180bccdaa24a625be30afeaa8ee23cde529ce63cc7874cbf0190858",
    positions: "0x07271f07e391d3a1bf01f30816e9b02ef8b4f4a7ef5f53ee0e7f06e36992ee15",
    vesuPool: "0x05b5e36ab832fda23475460f51d1d43e1e259e0bcc8051d37ec6a2596ce0d635",
    owner: "0x00f08dea4d30852afcdfb27306cef969d9fcc1322b2abd9bd702f3c0becc7ad1",
  },
} as const;

export type NetworkId = keyof typeof ADDRESSES;
export const DEFAULT_NETWORK: NetworkId = "sepolia";
