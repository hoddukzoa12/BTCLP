/// BTCFi Manager — rebalance orchestrator
/// Supporting Domain: oracle reads, range detection, strategy switching
#[starknet::contract]
pub mod BTCFiManager {
    use starknet::ContractAddress;

    #[derive(Drop, Serde, starknet::Store, PartialEq)]
    pub enum VaultState {
        #[default]
        EkuboActive,
        VesuLending,
        Emergency,
    }

    #[storage]
    struct Storage {
        vault: ContractAddress,
        ekubo_strategy: ContractAddress,
        vesu_strategy: ContractAddress,
        pragma_oracle: ContractAddress,
        max_price_staleness: u64,
        rebalance_threshold_bps: u16,
        current_state: VaultState,
    }
}
