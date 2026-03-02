use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

use btcfi_vault::strategy::traits::{
    IStrategyDispatcher, IStrategyDispatcherTrait,
    IVesuLendingStrategyExtDispatcher, IVesuLendingStrategyExtDispatcherTrait,
};

// ── Addresses ──
fn OWNER() -> ContractAddress { 0x1.try_into().unwrap() }
fn VAULT() -> ContractAddress { 0x10.try_into().unwrap() }
fn MANAGER() -> ContractAddress { 0x11.try_into().unwrap() }
fn ALICE() -> ContractAddress { 0x2.try_into().unwrap() }

// ── Deploy helpers ──
fn deploy_mock_erc20(name: ByteArray, symbol: ByteArray) -> ContractAddress {
    let contract = declare("MockERC20").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];
    name.serialize(ref calldata);
    symbol.serialize(ref calldata);
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

fn deploy_mock_vesu_pool(asset: ContractAddress) -> ContractAddress {
    let contract = declare("MockVesuPool").unwrap().contract_class();
    let calldata: Array<felt252> = array![asset.into()];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

fn deploy_vesu_strategy(
    vault: ContractAddress,
    manager: ContractAddress,
    pool: ContractAddress,
    asset: ContractAddress,
) -> (ContractAddress, IStrategyDispatcher, IVesuLendingStrategyExtDispatcher) {
    let contract = declare("VesuLendingStrategy").unwrap().contract_class();
    let calldata: Array<felt252> = array![
        vault.into(),     // vault
        manager.into(),   // manager
        OWNER().into(),   // owner
        pool.into(),      // vesu_pool
        1,                // pool_id (felt252)
        asset.into(),     // asset (wBTC)
    ];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    (
        addr,
        IStrategyDispatcher { contract_address: addr },
        IVesuLendingStrategyExtDispatcher { contract_address: addr },
    )
}

fn mint_to(token: ContractAddress, to: ContractAddress, amount: u256) {
    let selector = selector!("mint_to");
    let mut calldata: Array<felt252> = array![];
    to.serialize(ref calldata);
    amount.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(token, selector, calldata.span()).unwrap();
}

// ══════════════════════════════════════════
//  Vesu Strategy Tests
// ══════════════════════════════════════════

#[test]
fn test_vesu_vault_address() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    assert(strategy.vault() == VAULT(), 'vault address mismatch');
}

#[test]
fn test_vesu_initial_total_assets_zero() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    assert(strategy.total_assets() == 0, 'initial total_assets == 0');
}

#[test]
fn test_vesu_deposit() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    let amount: u256 = 100000000; // 1 BTC

    // Push model: transfer wBTC to strategy first, then call deposit
    mint_to(wbtc, strategy_addr, amount);

    // Manager calls deposit
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    // total_assets should reflect deposited amount
    assert(strategy.total_assets() == amount, 'total_assets after deposit');
}

#[test]
fn test_vesu_deposit_and_withdraw() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    let amount: u256 = 500000000; // 5 BTC

    // Push wBTC to strategy
    mint_to(wbtc, strategy_addr, amount);

    // Deposit
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    assert(strategy.total_assets() == amount, 'after deposit');

    // Withdraw back to vault
    start_cheat_caller_address(strategy_addr, VAULT());
    strategy.withdraw(amount);
    stop_cheat_caller_address(strategy_addr);

    // Strategy should have 0 assets
    assert(strategy.total_assets() == 0, 'after withdraw');

    // Vault should have received wBTC
    assert(wbtc_disp.balance_of(VAULT()) == amount, 'vault got wbtc');
}

#[test]
fn test_vesu_partial_withdraw() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    let amount: u256 = 1000000000; // 10 BTC

    // Push and deposit
    mint_to(wbtc, strategy_addr, amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(amount);
    stop_cheat_caller_address(strategy_addr);

    // Withdraw half
    let half: u256 = 500000000; // 5 BTC
    start_cheat_caller_address(strategy_addr, VAULT());
    strategy.withdraw(half);
    stop_cheat_caller_address(strategy_addr);

    // Strategy should have half remaining
    assert(strategy.total_assets() == amount - half, 'half remaining');
    assert(wbtc_disp.balance_of(VAULT()) == half, 'vault got half');
}

#[test]
fn test_vesu_withdraw_capped_to_on_pool_collateral() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    let deposit_amount: u256 = 100000000; // 1 BTC

    // Push and deposit to pool
    mint_to(wbtc, strategy_addr, deposit_amount);
    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(deposit_amount);
    stop_cheat_caller_address(strategy_addr);

    // Now also give the strategy some idle wBTC (simulates rounding dust)
    let idle_amount: u256 = 5000000; // 0.05 BTC
    mint_to(wbtc, strategy_addr, idle_amount);

    // total_assets = collateral + idle = 1.05 BTC
    assert(strategy.total_assets() == deposit_amount + idle_amount, 'total incl idle');

    // Withdraw total_assets (1.05 BTC) — should cap pool withdrawal to 1 BTC
    // and also send the idle 0.05 BTC
    start_cheat_caller_address(strategy_addr, VAULT());
    strategy.withdraw(deposit_amount + idle_amount);
    stop_cheat_caller_address(strategy_addr);

    // Vault should get all of it
    assert(wbtc_disp.balance_of(VAULT()) == deposit_amount + idle_amount, 'vault got all');
    assert(strategy.total_assets() == 0, 'strategy empty');
}

#[test]
#[should_panic(expected: 'ONLY_VAULT_OR_MANAGER')]
fn test_vesu_deposit_unauthorized_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    // Alice (unauthorized) tries to deposit
    start_cheat_caller_address(strategy_addr, ALICE());
    strategy.deposit(100000000);
    stop_cheat_caller_address(strategy_addr);
}

#[test]
#[should_panic(expected: 'ONLY_VAULT_OR_MANAGER')]
fn test_vesu_withdraw_unauthorized_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    // Alice tries to withdraw
    start_cheat_caller_address(strategy_addr, ALICE());
    strategy.withdraw(100000000);
    stop_cheat_caller_address(strategy_addr);
}

#[test]
#[should_panic(expected: 'ZERO_AMOUNT')]
fn test_vesu_deposit_zero_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    start_cheat_caller_address(strategy_addr, MANAGER());
    strategy.deposit(0);
    stop_cheat_caller_address(strategy_addr);
}

#[test]
#[should_panic(expected: 'ZERO_AMOUNT')]
fn test_vesu_withdraw_zero_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, _ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    start_cheat_caller_address(strategy_addr, VAULT());
    strategy.withdraw(0);
    stop_cheat_caller_address(strategy_addr);
}

#[test]
fn test_vesu_set_manager() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, _strategy, ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    let new_manager: ContractAddress = 0x99.try_into().unwrap();

    // Owner sets new manager
    start_cheat_caller_address(strategy_addr, OWNER());
    ext.set_manager(new_manager);
    stop_cheat_caller_address(strategy_addr);
    // No revert = success
}

#[test]
#[should_panic]
fn test_vesu_set_manager_by_non_owner_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, _strategy, ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    // Non-owner tries to set manager
    start_cheat_caller_address(strategy_addr, ALICE());
    ext.set_manager(ALICE());
    stop_cheat_caller_address(strategy_addr);
}

#[test]
fn test_vesu_current_apy() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (_addr, _strategy, ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    // MockVesuPool returns 50% utilization = 500000000000000000
    let apy = ext.current_apy();
    assert(apy == 500000000000000000, 'apy from utilization');
}

#[test]
fn test_vesu_supply_delegates_to_deposit() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let pool = deploy_mock_vesu_pool(wbtc);
    let (strategy_addr, strategy, ext) = deploy_vesu_strategy(VAULT(), MANAGER(), pool, wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, strategy_addr, amount);

    // supply() should work like deposit()
    start_cheat_caller_address(strategy_addr, MANAGER());
    ext.supply(amount);
    stop_cheat_caller_address(strategy_addr);

    assert(strategy.total_assets() == amount, 'supply == deposit');
}
