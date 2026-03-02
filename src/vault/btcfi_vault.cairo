/// BTCFi Strategy Vault — ERC-4626 compliant vault
/// Core Domain: user deposits, share accounting, asset custody
#[starknet::contract]
pub mod BTCFiVault {
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        asset: ContractAddress,
        ekubo_strategy: ContractAddress,
        vesu_strategy: ContractAddress,
        manager: ContractAddress,
        ekubo_allocation_bps: u16,
        vesu_allocation_bps: u16,
        paused: bool,
    }
}
