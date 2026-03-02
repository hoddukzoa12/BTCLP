/// Mock Pragma Oracle — controllable price feed for testing & demo
/// Generic Subdomain: set_price() to simulate BTC price changes
#[starknet::contract]
pub mod MockPragmaOracle {
    #[storage]
    struct Storage {
        price: u128,
        decimals: u32,
        num_sources: u32,
    }
}
