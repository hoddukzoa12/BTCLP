/// Ekubo LP Strategy — concentrated liquidity management
/// Core Domain: deposit/withdraw liquidity, collect fees
#[starknet::contract]
pub mod EkuboLPStrategy {
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        vault: ContractAddress,
        ekubo_positions: ContractAddress,
        ekubo_core: ContractAddress,
        nft_id: u64,
    }
}
