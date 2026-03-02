/// Common strategy interface
/// Both EkuboLP and VesuLending implement this trait
use starknet::ContractAddress;

#[starknet::interface]
pub trait IStrategy<TContractState> {
    fn total_assets(self: @TContractState) -> u256;
    fn vault(self: @TContractState) -> ContractAddress;
}
