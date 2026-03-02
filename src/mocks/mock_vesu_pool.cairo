/// Mock Vesu Pool — simulates IVesuPool for unit testing.
/// Tracks collateral deposits and allows withdrawals with ERC-20 transfers.
#[starknet::contract]
pub mod MockVesuPool {
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use alexandria_math::i257::I257Impl;
    use alexandria_math::i257::i257;

    use super::super::super::interfaces::vesu::{
        ModifyPositionParams, UpdatePositionResponse,
        VesuPosition, AssetConfig, AssetPrice,
    };

    #[storage]
    struct Storage {
        // Per-user collateral tracking (simplified: single user)
        collateral_shares: u256,
        collateral_assets: u256,
        asset_token: ContractAddress,
        depositor: ContractAddress,  // The strategy that deposited
    }

    #[constructor]
    fn constructor(ref self: ContractState, asset_token: ContractAddress) {
        self.asset_token.write(asset_token);
    }

    // ── IVesuPool implementation ──
    #[abi(embed_v0)]
    impl VesuPoolImpl of super::super::super::interfaces::vesu::IVesuPool<ContractState> {
        fn modify_position(
            ref self: ContractState, params: ModifyPositionParams,
        ) -> UpdatePositionResponse {
            let caller = get_caller_address();
            let asset_addr = self.asset_token.read();
            let asset_disp = IERC20Dispatcher { contract_address: asset_addr };

            // Extract collateral delta (positive = deposit, negative = withdraw)
            let col_val = params.collateral.value;
            let is_negative = col_val.is_negative();
            let magnitude: u256 = col_val.abs();

            if is_negative && magnitude > 0 {
                // Withdraw collateral — transfer from pool to caller
                let cur = self.collateral_assets.read();
                let withdraw_amt = if magnitude > cur { cur } else { magnitude };
                self.collateral_assets.write(cur - withdraw_amt);
                self.collateral_shares.write(cur - withdraw_amt);
                asset_disp.transfer(caller, withdraw_amt);
            } else if magnitude > 0 {
                // Deposit collateral — pull from caller to pool
                asset_disp.transfer_from(caller, get_contract_address(), magnitude);
                let cur = self.collateral_assets.read();
                self.collateral_assets.write(cur + magnitude);
                self.collateral_shares.write(cur + magnitude);
                self.depositor.write(caller);
            }

            UpdatePositionResponse {
                collateral_delta: params.collateral.value,
                collateral_shares_delta: params.collateral.value,
                debt_delta: I257Impl::new(0, false),
                nominal_debt_delta: I257Impl::new(0, false),
                bad_debt: 0,
            }
        }

        fn position(
            self: @ContractState,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
        ) -> (VesuPosition, u256, u256) {
            let shares = self.collateral_shares.read();
            (
                VesuPosition {
                    collateral_shares: shares,
                    nominal_debt: 0,
                },
                self.collateral_assets.read(), // collateral value
                0, // debt value
            )
        }

        fn asset_config(self: @ContractState, asset: ContractAddress) -> AssetConfig {
            AssetConfig {
                total_collateral_shares: self.collateral_shares.read(),
                total_nominal_debt: 0,
                reserve: 0,
                max_utilization: 0,
                floor: 0,
                scale: 100000000_u256, // 1e8
                is_legacy: false,
                last_updated: 0,
                last_rate_accumulator: 1000000000000000000_u256, // 1e18
                last_full_utilization_rate: 0,
                fee_rate: 0,
                fee_shares: 0,
            }
        }

        fn price(self: @ContractState, asset: ContractAddress) -> AssetPrice {
            AssetPrice { value: 6500000000000_u256, is_valid: true }
        }

        fn rate_accumulator(self: @ContractState, asset: ContractAddress) -> u256 {
            1000000000000000000_u256 // 1e18
        }

        fn utilization(self: @ContractState, asset: ContractAddress) -> u256 {
            500000000000000000_u256 // 50% = 0.5e18
        }

        fn is_paused(self: @ContractState) -> bool {
            false
        }

        fn modify_delegation(ref self: ContractState, delegatee: ContractAddress, delegation: bool) {
            // No-op for testing
        }

        fn delegation(
            self: @ContractState, delegator: ContractAddress, delegatee: ContractAddress,
        ) -> bool {
            true
        }

        fn calculate_debt(
            self: @ContractState, nominal_debt: i257, rate_accumulator: u256, asset_scale: u256,
        ) -> u256 {
            0
        }

        fn calculate_collateral(
            self: @ContractState, asset: ContractAddress, collateral_shares: i257,
        ) -> u256 {
            // 1:1 shares-to-assets for simplicity
            collateral_shares.abs()
        }
    }
}
