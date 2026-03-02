/// Mock ERC-20 — mintable test token (wBTC, USDC)
/// Generic Subdomain: for unit tests and Sepolia demo
#[starknet::contract]
pub mod MockERC20 {
    #[storage]
    struct Storage {
        name: felt252,
        symbol: felt252,
        decimals: u8,
    }
}
