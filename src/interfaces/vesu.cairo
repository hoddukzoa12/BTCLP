/// Anti-Corruption Layer — Vesu V2 Lending Protocol interfaces
/// Vendored from vesuxyz/vesu-v2 (Cairo 2.11.4)
/// We manually vendor because the upstream targets Cairo 2.11.4
/// while our project targets Cairo 2.14.0.
///
/// Only the types and trait methods needed by the BTCFi Vault are included.
/// Full source: https://github.com/vesuxyz/vesu-v2

use alexandria_math::i257::i257;
use starknet::ContractAddress;

// ============================================================
//  Data Model Types
// ============================================================

/// Denomination for Amount: Native (shares/nominal) or Assets (token units)
#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub enum AmountDenomination {
    #[default]
    Native,
    Assets,
}

/// Signed amount with denomination — used for collateral & debt changes.
/// value is i257 from Alexandria (signed 257-bit integer).
#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct Amount {
    pub denomination: AmountDenomination,
    pub value: i257,
}

/// Parameters for modify_position — supply/withdraw collateral and/or borrow/repay debt
#[derive(PartialEq, Copy, Drop, Serde)]
pub struct ModifyPositionParams {
    pub collateral_asset: ContractAddress,
    pub debt_asset: ContractAddress,
    pub user: ContractAddress,
    pub collateral: Amount,
    pub debt: Amount,
}

/// Response from modify_position — signed deltas for all changes
#[derive(PartialEq, Copy, Drop, Serde)]
pub struct UpdatePositionResponse {
    pub collateral_delta: i257,
    pub collateral_shares_delta: i257,
    pub debt_delta: i257,
    pub nominal_debt_delta: i257,
    pub bad_debt: u256,
}

/// Asset price from oracle
#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct AssetPrice {
    pub value: u256,
    pub is_valid: bool,
}

/// On-chain position state
#[derive(PartialEq, Copy, Drop, Serde)]
pub struct VesuPosition {
    pub collateral_shares: u256,
    pub nominal_debt: u256,
}

/// Asset configuration (read-only view)
#[derive(PartialEq, Copy, Drop, Serde)]
pub struct AssetConfig {
    pub total_collateral_shares: u256,
    pub total_nominal_debt: u256,
    pub reserve: u256,
    pub max_utilization: u256,
    pub floor: u256,
    pub scale: u256,
    pub is_legacy: bool,
    pub last_updated: u64,
    pub last_rate_accumulator: u256,
    pub last_full_utilization_rate: u256,
    pub fee_rate: u256,
    pub fee_shares: u256,
}

// ============================================================
//  IPool — Vesu V2 Pool contract (vault-relevant subset)
// ============================================================

#[starknet::interface]
pub trait IVesuPool<TContractState> {
    /// Supply/withdraw collateral and/or borrow/repay debt in a single call.
    /// This is the primary function the vault uses for Vesu interactions.
    fn modify_position(
        ref self: TContractState, params: ModifyPositionParams,
    ) -> UpdatePositionResponse;

    /// Query position state (collateral_shares, nominal_debt)
    fn position(
        self: @TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> (VesuPosition, u256, u256);

    /// Get asset configuration
    fn asset_config(self: @TContractState, asset: ContractAddress) -> AssetConfig;

    /// Get oracle price for an asset
    fn price(self: @TContractState, asset: ContractAddress) -> AssetPrice;

    /// Get rate accumulator for interest calculations
    fn rate_accumulator(self: @TContractState, asset: ContractAddress) -> u256;

    /// Get current utilization rate
    fn utilization(self: @TContractState, asset: ContractAddress) -> u256;

    /// Check if the pool is paused
    fn is_paused(self: @TContractState) -> bool;

    /// Delegate position management to another address
    fn modify_delegation(ref self: TContractState, delegatee: ContractAddress, delegation: bool);

    /// Check delegation status
    fn delegation(
        self: @TContractState, delegator: ContractAddress, delegatee: ContractAddress,
    ) -> bool;

    /// Calculate debt from nominal_debt
    fn calculate_debt(
        self: @TContractState, nominal_debt: i257, rate_accumulator: u256, asset_scale: u256,
    ) -> u256;

    /// Calculate collateral from shares
    fn calculate_collateral(
        self: @TContractState, asset: ContractAddress, collateral_shares: i257,
    ) -> u256;
}
