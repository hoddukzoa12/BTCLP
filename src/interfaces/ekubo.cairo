/// Anti-Corruption Layer — Ekubo Protocol interfaces
/// Vendored from EkuboProtocol/starknet-contracts

#[starknet::interface]
pub trait IEkuboPositions<TContractState> {
    fn get_position_info(self: @TContractState, id: u64) -> felt252;
}

#[starknet::interface]
pub trait IEkuboCore<TContractState> {
    fn get_pool_price(self: @TContractState, pool_key: felt252) -> felt252;
}
