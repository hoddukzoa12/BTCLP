/// Anti-Corruption Layer — Pragma Oracle interfaces
/// Vendored from vesu-v2/vendor/pragma.cairo

#[starknet::interface]
pub trait IPragmaOracle<TContractState> {
    fn get_decimals(self: @TContractState) -> u32;
}
