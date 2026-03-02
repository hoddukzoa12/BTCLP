/// Vesu Lending Strategy — lending pool management
/// Core Domain: supply/withdraw collateral
#[starknet::contract]
pub mod VesuLendingStrategy {
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        vault: ContractAddress,
        vesu_pool: ContractAddress,
        pool_id: felt252,
        asset: ContractAddress,
    }
}
