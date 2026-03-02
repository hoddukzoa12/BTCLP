/// Anti-Corruption Layer — Vesu V2 Protocol interfaces
/// Vendored from vesu-v2/src/pool.cairo

#[starknet::interface]
pub trait IVesuPool<TContractState> {
    fn pool_id(self: @TContractState) -> felt252;
}
