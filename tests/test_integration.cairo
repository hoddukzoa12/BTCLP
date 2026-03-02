/// Integration tests — full Escape/Return rebalance cycle with actual fund flow.
///
/// These tests deploy the entire system (Vault + Strategies + Manager + Mocks)
/// and verify end-to-end fund movement through the Manager's state machine.
///
/// Key challenge: circular constructor dependency.
/// - Vault constructor needs strategy addresses
/// - Strategy constructors need vault address
/// Solution: Deploy vault first with ZERO strategies, deploy strategies with
/// real vault addr, then use snforge `store` to patch vault's storage.

use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    store,
};
use starknet::ContractAddress;
use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

use btcfi_vault::oracle::btcfi_manager::BTCFiManager::{
    IBTCFiManagerDispatcher, IBTCFiManagerDispatcherTrait, VaultState,
};
use btcfi_vault::interfaces::vault::{IBTCFiVaultDispatcher, IBTCFiVaultDispatcherTrait};
use btcfi_vault::strategy::traits::{
    IStrategyDispatcher, IStrategyDispatcherTrait,
    IEkuboLPStrategyExtDispatcher, IEkuboLPStrategyExtDispatcherTrait,
    IVesuLendingStrategyExtDispatcher, IVesuLendingStrategyExtDispatcherTrait,
};

// ── Addresses ──
fn OWNER() -> ContractAddress { 0x1.try_into().unwrap() }
fn KEEPER() -> ContractAddress { 0x5.try_into().unwrap() }
fn ALICE() -> ContractAddress { 0x2.try_into().unwrap() }
fn ZERO() -> ContractAddress { 0.try_into().unwrap() }

// ── Syscall helpers ──
fn mint_to(token: ContractAddress, to: ContractAddress, amount: u256) {
    let selector = selector!("mint_to");
    let mut calldata: Array<felt252> = array![];
    to.serialize(ref calldata);
    amount.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(token, selector, calldata.span()).unwrap();
}

fn set_mock_price(oracle: ContractAddress, price: u128) {
    let selector = selector!("set_price");
    let mut calldata: Array<felt252> = array![];
    price.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(oracle, selector, calldata.span()).unwrap();
}

fn set_mock_fees(positions: ContractAddress, fees0: u128, fees1: u128) {
    let selector = selector!("set_fees");
    let mut calldata: Array<felt252> = array![];
    fees0.serialize(ref calldata);
    fees1.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(positions, selector, calldata.span()).unwrap();
}

// ── Deploy helpers ──
fn deploy_mock_erc20(name: ByteArray, symbol: ByteArray) -> ContractAddress {
    let contract = declare("MockERC20").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];
    name.serialize(ref calldata);
    symbol.serialize(ref calldata);
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

fn deploy_mock_pragma(price: u128, decimals: u32) -> ContractAddress {
    let contract = declare("MockPragmaOracle").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];
    price.serialize(ref calldata);
    decimals.serialize(ref calldata);
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

fn deploy_mock_ekubo_positions() -> ContractAddress {
    let contract = declare("MockEkuboPositions").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![]).unwrap();
    addr
}

fn deploy_mock_vesu_pool(asset: ContractAddress) -> ContractAddress {
    let contract = declare("MockVesuPool").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![asset.into()]).unwrap();
    addr
}

/// Full system with proper wiring (uses store to break circular dependency).
///
/// Deployment order:
///   1. MockERC20 (wBTC, USDC) + MockPragma + MockEkubo + MockVesu
///   2. Vault (with ZERO strategies/manager — placeholder)
///   3. Strategies (with REAL vault address)
///   4. Manager (with real vault + strategy addresses)
///   5. store() to patch vault's strategy & manager storage slots
///   6. set_manager() on strategies
#[derive(Drop)]
struct IntegrationSystem {
    vault_addr: ContractAddress,
    vault: IBTCFiVaultDispatcher,
    ekubo_addr: ContractAddress,
    ekubo_strategy: IStrategyDispatcher,
    ekubo_ext: IEkuboLPStrategyExtDispatcher,
    vesu_addr: ContractAddress,
    vesu_strategy: IStrategyDispatcher,
    manager_addr: ContractAddress,
    manager: IBTCFiManagerDispatcher,
    wbtc: ContractAddress,
    usdc: ContractAddress,
    oracle: ContractAddress,
    positions: ContractAddress,
    vesu_pool: ContractAddress,
}

fn deploy_integrated_system(
    initial_price: u128,
    lower_price: u256,
    upper_price: u256,
) -> IntegrationSystem {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let oracle = deploy_mock_pragma(initial_price, 8);
    let positions = deploy_mock_ekubo_positions();
    let vesu_pool = deploy_mock_vesu_pool(wbtc);

    // Step 1: Deploy Vault with ZERO strategies/manager (placeholder)
    let vault_class = declare("BTCFiVault").unwrap().contract_class();
    let vault_calldata: Array<felt252> = array![
        wbtc.into(), OWNER().into(),
        ZERO().into(), ZERO().into(), OWNER().into(),
    ];
    let (vault_addr, _) = vault_class.deploy(@vault_calldata).unwrap();

    // Step 2: Deploy strategies with REAL vault address
    let ekubo_class = declare("EkuboLPStrategy").unwrap().contract_class();
    let ekubo_calldata: Array<felt252> = array![
        vault_addr.into(), ZERO().into(), OWNER().into(),
        positions.into(), ZERO().into(),
        wbtc.into(), usdc.into(),
        170141183460469235273462165868118016, 200, ZERO().into(),
    ];
    let (ekubo_addr, _) = ekubo_class.deploy(@ekubo_calldata).unwrap();

    let vesu_class = declare("VesuLendingStrategy").unwrap().contract_class();
    let vesu_calldata: Array<felt252> = array![
        vault_addr.into(), ZERO().into(), OWNER().into(),
        vesu_pool.into(), 1, wbtc.into(),
    ];
    let (vesu_addr, _) = vesu_class.deploy(@vesu_calldata).unwrap();

    // Step 3: Deploy Manager with all real addresses
    let manager_class = declare("BTCFiManager").unwrap().contract_class();
    let mut manager_calldata: Array<felt252> = array![
        OWNER().into(), vault_addr.into(),
        ekubo_addr.into(), vesu_addr.into(),
        oracle.into(), wbtc.into(), KEEPER().into(),
    ];
    lower_price.serialize(ref manager_calldata);
    upper_price.serialize(ref manager_calldata);
    let (manager_addr, _) = manager_class.deploy(@manager_calldata).unwrap();

    // Step 4: Patch vault storage with real strategy & manager addresses
    // Storage var names: ekubo_strategy_addr, vesu_strategy_addr, manager_addr
    let ekubo_slot = selector!("ekubo_strategy_addr");
    let vesu_slot = selector!("vesu_strategy_addr");
    let manager_slot = selector!("manager_addr");
    store(vault_addr, ekubo_slot, array![ekubo_addr.into()].span());
    store(vault_addr, vesu_slot, array![vesu_addr.into()].span());
    store(vault_addr, manager_slot, array![manager_addr.into()].span());

    // Step 5: Wire manager on strategies
    start_cheat_caller_address(ekubo_addr, OWNER());
    IEkuboLPStrategyExtDispatcher { contract_address: ekubo_addr }.set_manager(manager_addr);
    stop_cheat_caller_address(ekubo_addr);

    start_cheat_caller_address(vesu_addr, OWNER());
    IVesuLendingStrategyExtDispatcher { contract_address: vesu_addr }.set_manager(manager_addr);
    stop_cheat_caller_address(vesu_addr);

    IntegrationSystem {
        vault_addr,
        vault: IBTCFiVaultDispatcher { contract_address: vault_addr },
        ekubo_addr,
        ekubo_strategy: IStrategyDispatcher { contract_address: ekubo_addr },
        ekubo_ext: IEkuboLPStrategyExtDispatcher { contract_address: ekubo_addr },
        vesu_addr,
        vesu_strategy: IStrategyDispatcher { contract_address: vesu_addr },
        manager_addr,
        manager: IBTCFiManagerDispatcher { contract_address: manager_addr },
        wbtc, usdc, oracle, positions, vesu_pool,
    }
}

/// Helper: deposit wBTC into vault as ALICE, return shares minted
fn user_deposit(sys: @IntegrationSystem, amount: u256) -> u256 {
    let wbtc_disp = IERC20Dispatcher { contract_address: *sys.wbtc };

    // Mint wBTC to ALICE
    mint_to(*sys.wbtc, ALICE(), amount);

    // ALICE approves vault
    start_cheat_caller_address(*sys.wbtc, ALICE());
    wbtc_disp.approve(*sys.vault_addr, amount);
    stop_cheat_caller_address(*sys.wbtc);

    // ALICE deposits
    start_cheat_caller_address(*sys.vault_addr, ALICE());
    let shares = (*sys.vault).deposit(amount, ALICE());
    stop_cheat_caller_address(*sys.vault_addr);

    shares
}

/// Helper: transfer vault's wBTC to ekubo strategy and deposit
fn vault_to_ekubo(sys: @IntegrationSystem, amount: u256) {
    let wbtc_disp = IERC20Dispatcher { contract_address: *sys.wbtc };

    // Owner calls transfer_to_strategy (simulates allocation)
    start_cheat_caller_address(*sys.vault_addr, OWNER());
    (*sys.vault).transfer_to_strategy(*sys.ekubo_addr, amount);
    stop_cheat_caller_address(*sys.vault_addr);

    // Strategy needs to approve mock positions
    start_cheat_caller_address(*sys.wbtc, *sys.ekubo_addr);
    wbtc_disp.approve(*sys.positions, amount);
    stop_cheat_caller_address(*sys.wbtc);

    // Manager/owner deposits into ekubo strategy
    start_cheat_caller_address(*sys.ekubo_addr, *sys.manager_addr);
    (*sys.ekubo_strategy).deposit(amount);
    stop_cheat_caller_address(*sys.ekubo_addr);
}

// ══════════════════════════════════════════════════════════════
//  1. System Wiring Verification
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_system_wiring() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);

    // Vault knows its strategies and manager
    assert(sys.vault.ekubo_strategy() == sys.ekubo_addr, 'vault>ekubo');
    assert(sys.vault.vesu_strategy() == sys.vesu_addr, 'vault>vesu');
    assert(sys.vault.manager() == sys.manager_addr, 'vault>manager');

    // Strategies know the vault
    assert(sys.ekubo_strategy.vault() == sys.vault_addr, 'ekubo>vault');
    assert(sys.vesu_strategy.vault() == sys.vault_addr, 'vesu>vault');

    // Manager initial state
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'init: EkuboActive');
}

// ══════════════════════════════════════════════════════════════
//  2. Deposit → Ekubo LP → Full Cycle Test
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_deposit_to_ekubo_lp() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);
    let wbtc_disp = IERC20Dispatcher { contract_address: sys.wbtc };

    // ALICE deposits 1 BTC (1e8 sats) into vault
    let deposit_amount: u256 = 100_000_000; // 1 BTC
    let _shares = user_deposit(@sys, deposit_amount);

    // wBTC should be in vault now
    let vault_bal = wbtc_disp.balance_of(sys.vault_addr);
    assert(vault_bal == deposit_amount, 'vault has wBTC');

    // Owner allocates to Ekubo strategy
    vault_to_ekubo(@sys, deposit_amount);

    // Verify: vault wBTC = 0, ekubo has position
    let vault_bal_after = wbtc_disp.balance_of(sys.vault_addr);
    assert(vault_bal_after == 0, 'vault empty after alloc');
    assert(sys.ekubo_ext.total_liquidity() > 0, 'ekubo has liquidity');
    assert(sys.ekubo_strategy.total_assets() == deposit_amount, 'ekubo total_assets');
}

// ══════════════════════════════════════════════════════════════
//  3. Escape Rebalance: Ekubo → Vesu (price exits range)
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_escape_rebalance_ekubo_to_vesu() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);
    let wbtc_disp = IERC20Dispatcher { contract_address: sys.wbtc };

    let deposit_amount: u256 = 100_000_000;
    user_deposit(@sys, deposit_amount);
    vault_to_ekubo(@sys, deposit_amount);

    // Verify initial state: wBTC in Ekubo
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'pre-escape: Ekubo');
    assert(sys.ekubo_strategy.total_assets() == deposit_amount, 'ekubo has funds');
    assert(sys.vesu_strategy.total_assets() == 0, 'vesu empty');

    // Price drops below range
    set_mock_price(sys.oracle, 5500000000000);
    assert(sys.manager.check_rebalance() == true, 'escape needed');

    // Keeper triggers rebalance (escape)
    // Manager will: withdraw_liquidity from Ekubo (wBTC→vault), then
    // vault.transfer_to_strategy(vesu, delta), then vesu.deposit(delta)
    //
    // For this to work, Vesu strategy needs approval from vault to pull from vesu pool
    // Actually the mock vesu pool pulls from strategy (transfer_from), so strategy
    // needs to approve the pool.
    start_cheat_caller_address(sys.wbtc, sys.vesu_addr);
    wbtc_disp.approve(sys.vesu_pool, deposit_amount);
    stop_cheat_caller_address(sys.wbtc);

    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);

    // Post-escape state verification
    assert(sys.manager.get_state() == VaultState::VesuLending, 'post-escape: Vesu');
    assert(sys.ekubo_ext.total_liquidity() == 0, 'ekubo cleared');

    // wBTC should have moved: Ekubo → vault → Vesu
    let vesu_assets = sys.vesu_strategy.total_assets();
    assert(vesu_assets == deposit_amount, 'vesu has all wBTC');

    // Vault buffer should be 0 (all forwarded)
    let vault_bal = wbtc_disp.balance_of(sys.vault_addr);
    assert(vault_bal == 0, 'vault buffer 0');
}

// ══════════════════════════════════════════════════════════════
//  4. Return Rebalance: Vesu → Ekubo (price re-enters range)
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_return_rebalance_vesu_to_ekubo() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);
    let wbtc_disp = IERC20Dispatcher { contract_address: sys.wbtc };

    let deposit_amount: u256 = 100_000_000;
    user_deposit(@sys, deposit_amount);
    vault_to_ekubo(@sys, deposit_amount);

    // Pre-approve vesu pool for strategy
    start_cheat_caller_address(sys.wbtc, sys.vesu_addr);
    wbtc_disp.approve(sys.vesu_pool, deposit_amount * 2); // extra for safety
    stop_cheat_caller_address(sys.wbtc);

    // Escape: price below range
    set_mock_price(sys.oracle, 5500000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::VesuLending, 'escaped to Vesu');

    // Price returns to range
    set_mock_price(sys.oracle, 6500000000000);
    assert(sys.manager.check_rebalance() == true, 'return needed');

    // Ekubo strategy needs to approve positions for the return deposit
    start_cheat_caller_address(sys.wbtc, sys.ekubo_addr);
    wbtc_disp.approve(sys.positions, deposit_amount * 2);
    stop_cheat_caller_address(sys.wbtc);

    // Keeper triggers return rebalance
    // Manager will: vesu.withdraw(all) → wBTC to vault →
    //   vault.transfer_to_strategy(ekubo, delta) → ekubo.deposit(delta)
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);

    // Post-return state verification
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'returned to Ekubo');
    assert(sys.vesu_strategy.total_assets() == 0, 'vesu emptied');
    assert(sys.ekubo_strategy.total_assets() == deposit_amount, 'ekubo has wBTC');
    assert(sys.ekubo_ext.total_liquidity() > 0, 'ekubo has liquidity');
}

// ══════════════════════════════════════════════════════════════
//  5. Full Cycle: Deposit → Escape → Return → Withdraw
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_full_cycle_deposit_escape_return_withdraw() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);
    let wbtc_disp = IERC20Dispatcher { contract_address: sys.wbtc };

    let deposit_amount: u256 = 100_000_000;
    let shares = user_deposit(@sys, deposit_amount);
    assert(shares > 0, 'got shares');

    // Allocate to Ekubo
    vault_to_ekubo(@sys, deposit_amount);

    // Pre-approve for the full cycle
    start_cheat_caller_address(sys.wbtc, sys.vesu_addr);
    wbtc_disp.approve(sys.vesu_pool, deposit_amount * 2);
    stop_cheat_caller_address(sys.wbtc);
    start_cheat_caller_address(sys.wbtc, sys.ekubo_addr);
    wbtc_disp.approve(sys.positions, deposit_amount * 2);
    stop_cheat_caller_address(sys.wbtc);

    // ── Phase 1: Escape ──
    set_mock_price(sys.oracle, 5500000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::VesuLending, 'phase1: Vesu');

    // ── Phase 2: Return ──
    set_mock_price(sys.oracle, 6500000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'phase2: Ekubo');

    // ── Phase 3: Withdraw ──
    // First: pull funds from Ekubo back to vault (owner triggers ensure_liquidity
    // or manual withdraw). For simplicity, owner withdraws from strategy directly.
    start_cheat_caller_address(sys.ekubo_addr, sys.vault_addr);
    sys.ekubo_strategy.withdraw(deposit_amount);
    stop_cheat_caller_address(sys.ekubo_addr);

    // Vault should now hold wBTC
    let vault_bal = wbtc_disp.balance_of(sys.vault_addr);
    assert(vault_bal == deposit_amount, 'vault has wBTC for redeem');

    // ALICE redeems all shares
    start_cheat_caller_address(sys.vault_addr, ALICE());
    let redeemed = sys.vault.redeem(shares, ALICE(), ALICE());
    stop_cheat_caller_address(sys.vault_addr);

    // ALICE should get back her original deposit (minus virtual offset dust)
    // With +1 virtual offset: deposit 1e8, shares ≈ 1e8 (off by 1)
    // redeem(shares) may return deposit_amount or deposit_amount - 1 due to rounding
    assert(redeemed >= deposit_amount - 1, 'alice got funds back');
    assert(wbtc_disp.balance_of(ALICE()) >= deposit_amount - 1, 'alice balance');
}

// ══════════════════════════════════════════════════════════════
//  6. Emergency Escape with Funds
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_emergency_escape_with_funds() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);
    let wbtc_disp = IERC20Dispatcher { contract_address: sys.wbtc };

    let deposit_amount: u256 = 100_000_000;
    user_deposit(@sys, deposit_amount);
    vault_to_ekubo(@sys, deposit_amount);

    // Pre-approve vesu for deposit during emergency
    start_cheat_caller_address(sys.wbtc, sys.vesu_addr);
    wbtc_disp.approve(sys.vesu_pool, deposit_amount * 2);
    stop_cheat_caller_address(sys.wbtc);

    // Owner triggers emergency escape (regardless of price)
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.emergency_escape();
    stop_cheat_caller_address(sys.manager_addr);

    assert(sys.manager.get_state() == VaultState::Emergency, 'emergency state');
    assert(sys.ekubo_ext.total_liquidity() == 0, 'ekubo cleared');

    // wBTC should be in Vesu (emergency escape does Ekubo→Vesu)
    let vesu_assets = sys.vesu_strategy.total_assets();
    assert(vesu_assets == deposit_amount, 'vesu has wBTC');
}

// ══════════════════════════════════════════════════════════════
//  7. Multiple Escapes: Price bounces
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_double_escape_return_cycle() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);
    let wbtc_disp = IERC20Dispatcher { contract_address: sys.wbtc };

    let deposit_amount: u256 = 50_000_000; // 0.5 BTC
    user_deposit(@sys, deposit_amount);
    vault_to_ekubo(@sys, deposit_amount);

    // Pre-approve for multiple cycles
    start_cheat_caller_address(sys.wbtc, sys.vesu_addr);
    wbtc_disp.approve(sys.vesu_pool, deposit_amount * 4);
    stop_cheat_caller_address(sys.wbtc);
    start_cheat_caller_address(sys.wbtc, sys.ekubo_addr);
    wbtc_disp.approve(sys.positions, deposit_amount * 4);
    stop_cheat_caller_address(sys.wbtc);

    // ── Cycle 1: Escape ──
    set_mock_price(sys.oracle, 5500000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::VesuLending, 'cycle1: escape');
    assert(sys.vesu_strategy.total_assets() == deposit_amount, 'cycle1: vesu has all');

    // ── Cycle 1: Return ──
    set_mock_price(sys.oracle, 6500000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'cycle1: return');
    assert(sys.ekubo_strategy.total_assets() == deposit_amount, 'cycle1: ekubo has all');

    // ── Cycle 2: Escape (above range this time) ──
    set_mock_price(sys.oracle, 7500000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::VesuLending, 'cycle2: escape');
    assert(sys.vesu_strategy.total_assets() == deposit_amount, 'cycle2: vesu has all');

    // ── Cycle 2: Return ──
    set_mock_price(sys.oracle, 6800000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'cycle2: return');
    assert(sys.ekubo_strategy.total_assets() == deposit_amount, 'cycle2: ekubo all');
}

// ══════════════════════════════════════════════════════════════
//  8. Vault Total Assets Includes Strategy Balances
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_vault_total_assets_tracks_strategies() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);

    let deposit_amount: u256 = 100_000_000;
    user_deposit(@sys, deposit_amount);

    // All in vault buffer initially
    assert(sys.vault.total_assets() == deposit_amount, 'total: in vault');

    // Move to Ekubo
    vault_to_ekubo(@sys, deposit_amount);

    // total_assets should still = deposit_amount (now in strategy)
    assert(sys.vault.total_assets() == deposit_amount, 'total: in ekubo');
}

// ══════════════════════════════════════════════════════════════
//  9. check_rebalance Tracks State Correctly Through Cycle
// ══════════════════════════════════════════════════════════════

#[test]
fn test_integration_check_rebalance_state_awareness() {
    let sys = deploy_integrated_system(6500000000000, 6000000000000, 7000000000000);
    let wbtc_disp = IERC20Dispatcher { contract_address: sys.wbtc };

    let deposit_amount: u256 = 100_000_000;
    user_deposit(@sys, deposit_amount);
    vault_to_ekubo(@sys, deposit_amount);

    start_cheat_caller_address(sys.wbtc, sys.vesu_addr);
    wbtc_disp.approve(sys.vesu_pool, deposit_amount * 2);
    stop_cheat_caller_address(sys.wbtc);

    // In range: no rebalance needed
    assert(sys.manager.check_rebalance() == false, 'in range: false');

    // Price drops below: escape needed
    set_mock_price(sys.oracle, 5500000000000);
    assert(sys.manager.check_rebalance() == true, 'below: true');

    // Execute escape
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);

    // Now in VesuLending, price still below: no return possible
    assert(sys.manager.check_rebalance() == false, 'vesu+below: false');

    // Price back to range: return needed
    set_mock_price(sys.oracle, 6500000000000);
    assert(sys.manager.check_rebalance() == true, 'vesu+in: true');
}
