/// IBTCFiVault — public interface for the BTCFi Strategy Vault
/// ERC-4626 methods are provided by OZ ERC20Component; this trait
/// covers vault-specific management and view functions.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IBTCFiVault<TContractState> {
    // ── ERC-4626 Core ──
    fn deposit(ref self: TContractState, assets: u256, receiver: ContractAddress) -> u256;
    fn mint(ref self: TContractState, shares: u256, receiver: ContractAddress) -> u256;
    fn withdraw(
        ref self: TContractState, assets: u256, receiver: ContractAddress, owner: ContractAddress,
    ) -> u256;
    fn redeem(
        ref self: TContractState, shares: u256, receiver: ContractAddress, owner: ContractAddress,
    ) -> u256;

    // ── ERC-4626 View ──
    fn asset(self: @TContractState) -> ContractAddress;
    fn total_assets(self: @TContractState) -> u256;
    fn convert_to_shares(self: @TContractState, assets: u256) -> u256;
    fn convert_to_assets(self: @TContractState, shares: u256) -> u256;
    fn max_deposit(self: @TContractState, receiver: ContractAddress) -> u256;
    fn max_mint(self: @TContractState, receiver: ContractAddress) -> u256;
    fn max_withdraw(self: @TContractState, owner: ContractAddress) -> u256;
    fn max_redeem(self: @TContractState, owner: ContractAddress) -> u256;
    fn preview_deposit(self: @TContractState, assets: u256) -> u256;
    fn preview_mint(self: @TContractState, shares: u256) -> u256;
    fn preview_withdraw(self: @TContractState, assets: u256) -> u256;
    fn preview_redeem(self: @TContractState, shares: u256) -> u256;

    // ── Management (Owner / Manager only) ──
    fn set_allocation(ref self: TContractState, ekubo_bps: u16, vesu_bps: u16);
    fn pause(ref self: TContractState);
    fn unpause(ref self: TContractState);
    fn emergency_withdraw(ref self: TContractState);

    /// Transfer assets from vault to a strategy contract during rebalance.
    /// Called by Manager to move wBTC from vault to destination strategy
    /// before calling strategy.deposit().
    fn transfer_to_strategy(ref self: TContractState, strategy: ContractAddress, amount: u256);

    // ── Admin Setters (Owner only) ──
    // Used post-deployment to wire circular dependencies:
    // Vault needs strategy/manager addresses, but strategies need vault address.
    // Deploy vault first with zero addresses, deploy strategies with real vault,
    // then call these setters to complete the wiring.

    /// Set or update the strategy contract addresses. Owner only.
    fn set_strategies(
        ref self: TContractState,
        ekubo_strategy: ContractAddress,
        vesu_strategy: ContractAddress,
    );

    /// Set or update the manager contract address. Owner only.
    fn set_manager_addr(ref self: TContractState, new_manager: ContractAddress);

    // ── View ──
    fn ekubo_allocation_bps(self: @TContractState) -> u16;
    fn vesu_allocation_bps(self: @TContractState) -> u16;
    fn buffer_bps(self: @TContractState) -> u16;
    fn is_paused(self: @TContractState) -> bool;
    fn ekubo_strategy(self: @TContractState) -> ContractAddress;
    fn vesu_strategy(self: @TContractState) -> ContractAddress;
    fn manager(self: @TContractState) -> ContractAddress;
}
