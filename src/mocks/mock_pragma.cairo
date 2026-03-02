/// Mock Pragma Oracle — controllable price feed for testing & demo
/// Generic Subdomain: set_price() to simulate BTC price changes
///
/// Implements IPragmaABI so the Manager can call get_data_median().
#[starknet::contract]
pub mod MockPragmaOracle {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    use super::super::super::interfaces::pragma::{
        DataType, AggregationMode, PragmaPricesResponse,
    };

    #[storage]
    struct Storage {
        price: u128,         // e.g. 65000_00000000 for $65,000 with 8 decimals
        decimals: u32,       // e.g. 8
        last_updated: u64,
        num_sources: u32,
    }

    #[constructor]
    fn constructor(ref self: ContractState, initial_price: u128, decimals: u32) {
        self.price.write(initial_price);
        self.decimals.write(decimals);
        self.last_updated.write(starknet::get_block_timestamp());
        self.num_sources.write(3);
    }

    // ── IPragmaABI implementation ──
    #[abi(embed_v0)]
    impl PragmaImpl of super::super::super::interfaces::pragma::IPragmaABI<ContractState> {
        fn get_data(
            self: @ContractState, data_type: DataType, aggregation_mode: AggregationMode,
        ) -> PragmaPricesResponse {
            PragmaPricesResponse {
                price: self.price.read(),
                decimals: self.decimals.read(),
                last_updated_timestamp: self.last_updated.read(),
                num_sources_aggregated: self.num_sources.read(),
                expiration_timestamp: Option::None,
            }
        }

        fn get_data_median(self: @ContractState, data_type: DataType) -> PragmaPricesResponse {
            PragmaPricesResponse {
                price: self.price.read(),
                decimals: self.decimals.read(),
                last_updated_timestamp: self.last_updated.read(),
                num_sources_aggregated: self.num_sources.read(),
                expiration_timestamp: Option::None,
            }
        }
    }

    /// Test helper — set the price (anyone can call).
    #[external(v0)]
    fn set_price(ref self: ContractState, new_price: u128) {
        self.price.write(new_price);
        self.last_updated.write(starknet::get_block_timestamp());
    }
}
