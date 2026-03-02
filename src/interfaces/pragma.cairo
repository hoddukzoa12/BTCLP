/// Anti-Corruption Layer — Pragma Oracle interfaces
/// Vendored from vesuxyz/vesu-v2/src/vendor/pragma.cairo
/// This is the minimal vendored version used by Vesu V2.
///
/// Full Pragma library: https://github.com/astraly-labs/pragma-lib
/// We vendor instead of depending on pragma_lib because it targets Cairo 2.11.4.

// ============================================================
//  Types
// ============================================================

/// Data type selector for oracle queries.
/// SpotEntry(pair_id): e.g. SpotEntry('BTC/USD')
/// FutureEntry(pair_id, expiration): for futures pricing
/// GenericEntry(key): for arbitrary data feeds
#[derive(Drop, Copy, Serde)]
pub enum DataType {
    SpotEntry: felt252,
    FutureEntry: (felt252, u64),
    GenericEntry: felt252,
}

/// Aggregation mode for price feeds.
#[derive(Serde, Drop, Copy, PartialEq, Default, starknet::Store)]
pub enum AggregationMode {
    #[default]
    Median,
    Mean,
    Error,
}

/// Oracle price response — contains price, decimals, freshness, and source count.
#[derive(Serde, Drop, Copy)]
pub struct PragmaPricesResponse {
    pub price: u128,
    pub decimals: u32,
    pub last_updated_timestamp: u64,
    pub num_sources_aggregated: u32,
    pub expiration_timestamp: Option<u64>,
}

// ============================================================
//  IPragmaABI — Oracle interface (vault-relevant subset)
// ============================================================

#[starknet::interface]
pub trait IPragmaABI<TContractState> {
    /// Get aggregated price data with specified aggregation mode.
    fn get_data(
        self: @TContractState, data_type: DataType, aggregation_mode: AggregationMode,
    ) -> PragmaPricesResponse;

    /// Get median price — the most commonly used oracle query.
    /// Usage: get_data_median(DataType::SpotEntry('BTC/USD'))
    fn get_data_median(self: @TContractState, data_type: DataType) -> PragmaPricesResponse;
}

// ============================================================
//  ISummaryStatsABI — TWAP queries
// ============================================================

#[starknet::interface]
pub trait ISummaryStatsABI<TContractState> {
    /// Calculate Time-Weighted Average Price.
    fn calculate_twap(
        self: @TContractState,
        data_type: DataType,
        aggregation_mode: AggregationMode,
        time: u64,
        start_time: u64,
    ) -> (u128, u32);
}
