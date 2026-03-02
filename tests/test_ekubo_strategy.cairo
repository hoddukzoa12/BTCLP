use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

use btcfi_vault::strategy::traits::{
    IStrategyDispatcher, IStrategyDispatcherTrait,
    IEkuboLPStrategyExtDispatcher, IEkuboLPStrategyExtDispatcherTrait,
};

// ── Addresses ──
fn OWNER() -> ContractAddress { 0x1.try_into().unwrap() }
fn VAULT() -> ContractAddress { 0x10.try_into().unwrap() }
fn MANAGER() -> ContractAddress { 0x11.try_into().unwrap() }
fn ALICE() -> ContractAddress { 0x2.try_into().unwrap() }
fn ZERO() -> ContractAddress { 0.try_into().unwrap() }

// ── Deploy helpers ──
fn deploy_mock_erc20(name: ByteArray, symbol: ByteArray) -> ContractAddress {
    let contract = declare("MockERC20").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];
    name.serialize(ref calldata);
    symbol.serialize(ref calldata);
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

fn deploy_mock_ekubo_positions() -> ContractAddress {
    let contract = declare("MockEkuboPositions").unwrap().contract_class();
    let calldata: Array<felt252> = array![];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

fn deploy_ekubo_strategy(
    vault: ContractAddress,
    manager: ContractAddress,
    positions: ContractAddress,
    token0: ContractAddress,
    token1: ContractAddress,
) -> (ContractAddress, IStrategyDispatcher, IEkuboLPStrategyExtDispatcher) {
    let contract = declare("EkuboLPStrategy").unwrap().contract_class();
    let calldata: Array<felt252> = array![
        vault.into(),       // vault
        manager.into(),     // manager
        OWNER().into(),     // owner
        positions.into(),   // ekubo_positions
        ZERO().into(),      // ekubo_core (unused in mock)
        token0.into(),      // token0 (wBTC)
        token1.into(),      // token1 (USDC)
        170141183460469235273462165868118016,  // pool_fee (0.003 * 2^128 ≈ 1e33)
        200,                // pool_tick_spacing
        ZERO().into(),      // pool_extension
    ];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    (
        addr,
        IStrategyDispatcher { contract_address: addr },
        IEkuboLPStrategyExtDispatcher { contract_address: addr },
    )
}

fn mint_to(token: ContractAddress, to: ContractAddress, amount: u256) {
    let selector = selector!("mint_to");
    let mut calldata: Array<felt252> = array![];
    to.serialize(ref calldata);
    amount.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(token, selector, calldata.span()).unwrap();
}

// Helper to call MockEkuboPositions.set_fees via syscall
fn set_mock_fees(positions: ContractAddress, fees0: u128, fees1: u128) {
    let selector = selector!("set_fees");
    let mut calldata: Array<felt252> = array![];
    fees0.serialize(ref calldata);
    fees1.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(positions, selector, calldata.span()).unwrap();
}

// Helper to call MockEkuboPositions.set_token1_only
fn set_token1_only(positions: ContractAddress, amount1: u128) {
    let selector = selector!("set_token1_only");
    let mut calldata: Array<felt252> = array![];
    amount1.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(positions, selector, calldata.span()).unwrap();
}

// ══════════════════════════════════════════
//  Ekubo Strategy Tests
// ══════════════════════════════════════════

#[test]
fn test_ekubo_vault_address() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (_addr, strategy, _ext) = deploy_ekubo_strategy(VAULT(), MANAGER(), positions, wbtc, usdc);

    assert(strategy.vault() == VAULT(), 'vault address mismatch');
}

#[test]
fn test_ekubo_initial_state() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (_addr, strategy, ext) = deploy_ekubo_strategy(VAULT(), MANAGER(), positions, wbtc, usdc);

    assert(strategy.total_assets() == 0, 'initial total_assets == 0');
    assert(ext.nft_id() == 0, 'initial nft_id == 0');
    assert(ext.total_liquidity() == 0, 'initial liquidity == 0');
}

#[test]
fn test_ekubo_deposit_creates_nft() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    let amount: u256 = 100000000; // 1 BTC

    // Push wBTC to strategy
    mint_to(wbtc, strategy_addr, amount);

    // Manager calls deposit
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    // Should have minted NFT
    assert(ext.nft_id() > 0, 'nft should be minted');
    assert(ext.total_liquidity() > 0, 'liquidity > 0');
    // total_assets should include the position amount0
    assert(strategy.total_assets() > 0, 'total_assets > 0');
}

#[test]
fn test_ekubo_deposit_and_withdraw() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    let amount: u256 = 100000000; // 1 BTC

    // Deposit
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    // Withdraw all
    start_cheat_caller_address(strategy_addr, VAULT());
    strategy.withdraw(amount);
    stop_cheat_caller_address(strategy_addr);

    // NFT should be cleared (all liquidity removed)
    assert(ext.nft_id() == 0, 'nft cleared');

    // Vault should have received wBTC
    let vault_bal = wbtc_disp.balance_of(VAULT());
    assert(vault_bal == amount, 'vault got wbtc');

    // Strategy should be empty
    assert(strategy.total_assets() == 0, 'strategy empty');
}

#[test]
fn test_ekubo_second_deposit_adds_to_existing() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    let amount: u256 = 100000000; // 1 BTC

    // First deposit
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    let nft_after_first = ext.nft_id();
    let liq_after_first = ext.total_liquidity();

    // Second deposit
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    // Same NFT, more liquidity
    assert(ext.nft_id() == nft_after_first, 'same nft');
    assert(ext.total_liquidity() > liq_after_first, 'more liquidity');
}

#[test]
fn test_ekubo_total_assets_token0_only() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, _ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    let amount: u256 = 100000000; // 1 BTC

    // Deposit wBTC only
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    // total_assets should equal amount (only token0)
    assert(strategy.total_assets() == amount, 'total == token0 amount');
}

#[test]
fn test_ekubo_underlying_balance() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    // Before deposit
    let (bal0, bal1) = ext.underlying_balance();
    assert(bal0 == 0, 'before: bal0 == 0');
    assert(bal1 == 0, 'before: bal1 == 0');

    // Deposit
    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.deposit_liquidity(amount, 0);
    stop_cheat_caller_address(strategy_addr);

    let (bal0_after, _bal1_after) = ext.underlying_balance();
    assert(bal0_after > 0, 'after: bal0 > 0');
}

#[test]
fn test_ekubo_collect_fees() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    // First create a position
    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.deposit_liquidity(amount, 0);
    stop_cheat_caller_address(strategy_addr);

    // Set mock fees (need to mint wBTC/USDC to positions contract for transfer)
    let fee0: u128 = 1000000; // 0.01 BTC fee
    let fee1: u128 = 5000000; // 5 USDC fee
    mint_to(wbtc, positions, fee0.into());
    mint_to(usdc, positions, fee1.into());
    set_mock_fees(positions, fee0, fee1);

    // Collect fees
    start_cheat_caller_address(strategy_addr, MANAGER());
    let (collected0, collected1) = ext.collect_fees();
    stop_cheat_caller_address(strategy_addr);

    assert(collected0 == fee0, 'collected fee0');
    assert(collected1 == fee1, 'collected fee1');

    // token0 fees should have been sent to vault
    assert(wbtc_disp.balance_of(VAULT()) == fee0.into(), 'vault got fee0');

    // token1 fees stay in strategy (wBTC-only vault)
    let usdc_disp = IERC20Dispatcher { contract_address: usdc };
    assert(usdc_disp.balance_of(strategy_addr) == fee1.into(), 'strategy retains fee1');
}

#[test]
fn test_ekubo_sweep_token1() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );
    let usdc_disp = IERC20Dispatcher { contract_address: usdc };

    // Simulate some USDC sitting in the strategy
    let usdc_amount: u256 = 10000000; // 10 USDC
    mint_to(usdc, strategy_addr, usdc_amount);

    // Owner sweeps token1 to a destination
    let dest: ContractAddress = 0x42.try_into().unwrap();
    start_cheat_caller_address(strategy_addr, OWNER());
    let swept = ext.sweep_token1(dest);
    stop_cheat_caller_address(strategy_addr);

    assert(swept == usdc_amount, 'swept amount');
    assert(usdc_disp.balance_of(dest) == usdc_amount, 'dest got usdc');
    assert(usdc_disp.balance_of(strategy_addr) == 0, 'strategy usdc = 0');
}

#[test]
#[should_panic]
fn test_ekubo_sweep_by_non_owner_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    mint_to(usdc, strategy_addr, 10000000);

    // Non-owner tries to sweep
    start_cheat_caller_address(strategy_addr, ALICE());
    ext.sweep_token1(ALICE());
    stop_cheat_caller_address(strategy_addr);
}

#[test]
fn test_ekubo_set_bounds() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    // No active position, so set_bounds should work
    start_cheat_caller_address(strategy_addr, OWNER());
    ext.set_bounds(1000, true, 2000, false); // lower=-1000, upper=+2000
    stop_cheat_caller_address(strategy_addr);
    // No revert = success
}

#[test]
#[should_panic(expected: 'POSITION_ACTIVE')]
fn test_ekubo_set_bounds_with_active_position_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    // Create a position first
    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    // Now try to set bounds — should fail
    start_cheat_caller_address(strategy_addr, OWNER());
    ext.set_bounds(1000, true, 2000, false);
    stop_cheat_caller_address(strategy_addr);
}

#[test]
fn test_ekubo_withdraw_liquidity_ratio() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    // Deposit
    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.deposit_liquidity(amount, 0);
    stop_cheat_caller_address(strategy_addr);

    // Withdraw 50% via ratio
    let half_wad: u256 = 500000000000000000; // 0.5e18
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.withdraw_liquidity(half_wad, 0, 0);
    stop_cheat_caller_address(strategy_addr);

    // Vault should have received approximately half
    let vault_bal = wbtc_disp.balance_of(VAULT());
    assert(vault_bal > 0, 'vault got some wbtc');

    // Still has an active position
    assert(ext.nft_id() > 0, 'nft still active');
    assert(ext.total_liquidity() > 0, 'remaining liquidity');
}

#[test]
fn test_ekubo_withdraw_100_percent_clears_nft() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    // Deposit
    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.deposit_liquidity(amount, 0);
    stop_cheat_caller_address(strategy_addr);

    // Withdraw 100%
    let full_wad: u256 = 1000000000000000000; // 1e18
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.withdraw_liquidity(full_wad, 0, 0);
    stop_cheat_caller_address(strategy_addr);

    // NFT should be cleared
    assert(ext.nft_id() == 0, 'nft cleared after 100%');
}

#[test]
#[should_panic(expected: 'ONLY_VAULT_OR_MANAGER')]
fn test_ekubo_deposit_unauthorized_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, _ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    start_cheat_caller_address(strategy_addr, ALICE());
    strategy.deposit(100000000);
    stop_cheat_caller_address(strategy_addr);
}

#[test]
#[should_panic(expected: 'ZERO_AMOUNT')]
fn test_ekubo_deposit_zero_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, _ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(0);
    stop_cheat_caller_address(strategy_addr);
}

#[test]
fn test_ekubo_set_manager() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    let new_manager: ContractAddress = 0x99.try_into().unwrap();
    start_cheat_caller_address(strategy_addr, OWNER());
    ext.set_manager(new_manager);
    stop_cheat_caller_address(strategy_addr);
    // No revert = success
}

#[test]
fn test_ekubo_pending_fees() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    // No position — pending fees should be 0
    let (fees0, fees1) = ext.pending_fees();
    assert(fees0 == 0, 'no position: fees0 == 0');
    assert(fees1 == 0, 'no position: fees1 == 0');

    // Create position
    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.deposit_liquidity(amount, 0);
    stop_cheat_caller_address(strategy_addr);

    // Set mock fees
    set_mock_fees(positions, 500000, 2000000);

    let (fees0_after, fees1_after) = ext.pending_fees();
    assert(fees0_after == 500000, 'fees0 = 500000');
    assert(fees1_after == 2000000, 'fees1 = 2000000');
}

#[test]
fn test_ekubo_total_assets_includes_fees() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (strategy_addr, strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    // Deposit
    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.deposit_liquidity(amount, 0);
    stop_cheat_caller_address(strategy_addr);

    // Set token0 fees (token1 fees NOT included in total_assets)
    let fee0: u128 = 1000000;
    set_mock_fees(positions, fee0, 5000000);

    // total_assets = position.amount0 + fees0 + free_balance
    let total = strategy.total_assets();
    assert(total == amount + fee0.into(), 'total includes fees0');
}

#[test]
fn test_ekubo_get_deposit_ratio() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let positions = deploy_mock_ekubo_positions();
    let (_addr, _strategy, ext) = deploy_ekubo_strategy(
        VAULT(), MANAGER(), positions, wbtc, usdc,
    );

    // Currently returns 1:1 placeholder
    let (r0, r1) = ext.get_deposit_ratio();
    assert(r0 == 1, 'ratio0');
    assert(r1 == 1, 'ratio1');
}
