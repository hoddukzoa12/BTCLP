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

    // ── View ──
    fn ekubo_allocation_bps(self: @TContractState) -> u16;
    fn vesu_allocation_bps(self: @TContractState) -> u16;
    fn buffer_bps(self: @TContractState) -> u16;
    fn is_paused(self: @TContractState) -> bool;
    fn ekubo_strategy(self: @TContractState) -> ContractAddress;
    fn vesu_strategy(self: @TContractState) -> ContractAddress;
    fn manager(self: @TContractState) -> ContractAddress;
}
