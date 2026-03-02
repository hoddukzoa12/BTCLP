use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    store,
};
use starknet::ContractAddress;

use btcfi_vault::oracle::btcfi_manager::BTCFiManager::{
    IBTCFiManagerDispatcher, IBTCFiManagerDispatcherTrait, VaultState,
};
use btcfi_vault::interfaces::vault::IBTCFiVaultDispatcher;
use btcfi_vault::strategy::traits::{
    IEkuboLPStrategyExtDispatcher, IEkuboLPStrategyExtDispatcherTrait,
    IVesuLendingStrategyExtDispatcher, IVesuLendingStrategyExtDispatcherTrait,
};

// ── Addresses ──
fn OWNER() -> ContractAddress { 0x1.try_into().unwrap() }
fn KEEPER() -> ContractAddress { 0x5.try_into().unwrap() }
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

/// Full system deployment struct
#[derive(Drop)]
struct TestSystem {
    vault_addr: ContractAddress,
    vault: IBTCFiVaultDispatcher,
    ekubo_addr: ContractAddress,
    vesu_addr: ContractAddress,
    manager_addr: ContractAddress,
    manager: IBTCFiManagerDispatcher,
    wbtc: ContractAddress,
    usdc: ContractAddress,
    oracle: ContractAddress,
}

fn deploy_full_system(
    initial_price: u128,
    lower_price: u256,
    upper_price: u256,
) -> TestSystem {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let usdc = deploy_mock_erc20("USD Coin", "USDC");
    let oracle = deploy_mock_pragma(initial_price, 8);
    let positions = deploy_mock_ekubo_positions();
    let vesu_pool = deploy_mock_vesu_pool(wbtc);

    // Deploy Ekubo Strategy (vault/manager = ZERO placeholder initially)
    let ekubo_class = declare("EkuboLPStrategy").unwrap().contract_class();
    let ekubo_calldata: Array<felt252> = array![
        ZERO().into(), ZERO().into(), OWNER().into(),
        positions.into(), ZERO().into(),
        wbtc.into(), usdc.into(),
        170141183460469235273462165868118016, 200, ZERO().into(),
    ];
    let (ekubo_addr, _) = ekubo_class.deploy(@ekubo_calldata).unwrap();

    // Deploy Vesu Strategy (vault/manager = ZERO placeholder initially)
    let vesu_class = declare("VesuLendingStrategy").unwrap().contract_class();
    let vesu_calldata: Array<felt252> = array![
        ZERO().into(), ZERO().into(), OWNER().into(),
        vesu_pool.into(), 1, wbtc.into(),
    ];
    let (vesu_addr, _) = vesu_class.deploy(@vesu_calldata).unwrap();

    // Deploy Vault with actual strategy addresses
    let vault_class = declare("BTCFiVault").unwrap().contract_class();
    let vault_calldata: Array<felt252> = array![
        wbtc.into(), OWNER().into(),
        ekubo_addr.into(), vesu_addr.into(), OWNER().into(),
    ];
    let (vault_addr, _) = vault_class.deploy(@vault_calldata).unwrap();

    // Deploy Manager
    let manager_class = declare("BTCFiManager").unwrap().contract_class();
    let mut manager_calldata: Array<felt252> = array![
        OWNER().into(), vault_addr.into(),
        ekubo_addr.into(), vesu_addr.into(),
        oracle.into(), wbtc.into(), KEEPER().into(),
    ];
    lower_price.serialize(ref manager_calldata);
    upper_price.serialize(ref manager_calldata);
    let (manager_addr, _) = manager_class.deploy(@manager_calldata).unwrap();

    // Patch strategy vault_addr (deployed with ZERO, now set to real vault)
    let vault_slot = selector!("vault_addr");
    store(ekubo_addr, vault_slot, array![vault_addr.into()].span());
    store(vesu_addr, vault_slot, array![vault_addr.into()].span());

    // Patch vault manager_addr (deployed with OWNER, now set to real manager)
    let manager_slot = selector!("manager_addr");
    store(vault_addr, manager_slot, array![manager_addr.into()].span());

    // Wire: set manager on strategies
    start_cheat_caller_address(ekubo_addr, OWNER());
    IEkuboLPStrategyExtDispatcher { contract_address: ekubo_addr }.set_manager(manager_addr);
    stop_cheat_caller_address(ekubo_addr);

    start_cheat_caller_address(vesu_addr, OWNER());
    IVesuLendingStrategyExtDispatcher { contract_address: vesu_addr }
        .set_manager(manager_addr);
    stop_cheat_caller_address(vesu_addr);

    TestSystem {
        vault_addr,
        vault: IBTCFiVaultDispatcher { contract_address: vault_addr },
        ekubo_addr,
        vesu_addr,
        manager_addr,
        manager: IBTCFiManagerDispatcher { contract_address: manager_addr },
        wbtc, usdc, oracle,
    }
}

// ══════════════════════════════════════════
//  Manager State & View Tests
// ══════════════════════════════════════════

#[test]
fn test_manager_initial_state() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'initial: EkuboActive');
}

#[test]
fn test_manager_get_btc_price() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    let price = sys.manager.get_btc_price();
    assert(price == 6500000000000, 'btc price');
}

#[test]
fn test_manager_get_price_bounds() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    let (lower, upper) = sys.manager.get_price_bounds();
    assert(lower == 6000000000000, 'lower bound');
    assert(upper == 7000000000000, 'upper bound');
}

#[test]
fn test_manager_check_rebalance_in_range() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    assert(sys.manager.check_rebalance() == false, 'in range: no rebalance');
}

#[test]
fn test_manager_check_rebalance_below_range() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);
    assert(sys.manager.check_rebalance() == true, 'below: need escape');
}

#[test]
fn test_manager_check_rebalance_above_range() {
    let sys = deploy_full_system(7500000000000, 6000000000000, 7000000000000);
    assert(sys.manager.check_rebalance() == true, 'above: need escape');
}

// ══════════════════════════════════════════
//  Set Price Bounds
// ══════════════════════════════════════════

#[test]
fn test_manager_set_price_bounds() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);

    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.set_price_bounds(5000000000000, 8000000000000);
    stop_cheat_caller_address(sys.manager_addr);

    let (lower, upper) = sys.manager.get_price_bounds();
    assert(lower == 5000000000000, 'new lower');
    assert(upper == 8000000000000, 'new upper');
}

#[test]
#[should_panic(expected: 'INVALID_BOUNDS')]
fn test_manager_set_bounds_invalid_reverts() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.set_price_bounds(7000000000000, 6000000000000);
    stop_cheat_caller_address(sys.manager_addr);
}

#[test]
#[should_panic]
fn test_manager_set_bounds_non_owner_reverts() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, ALICE());
    sys.manager.set_price_bounds(5000000000000, 8000000000000);
    stop_cheat_caller_address(sys.manager_addr);
}

// ══════════════════════════════════════════
//  Access Control
// ══════════════════════════════════════════

#[test]
#[should_panic(expected: 'NOT_AUTHORIZED')]
fn test_manager_rebalance_unauthorized_reverts() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, ALICE());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
}

#[test]
#[should_panic(expected: 'PRICE_IN_RANGE')]
fn test_manager_rebalance_when_in_range_reverts() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
}

// ══════════════════════════════════════════
//  Keeper / Owner Settings
// ══════════════════════════════════════════

#[test]
fn test_manager_set_keeper() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    let new_keeper: ContractAddress = 0x77.try_into().unwrap();
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.set_keeper(new_keeper);
    stop_cheat_caller_address(sys.manager_addr);
}

#[test]
fn test_manager_set_max_staleness() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.set_max_staleness(600);
    stop_cheat_caller_address(sys.manager_addr);
}

#[test]
#[should_panic(expected: 'ZERO_STALENESS')]
fn test_manager_set_max_staleness_zero_reverts() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.set_max_staleness(0);
    stop_cheat_caller_address(sys.manager_addr);
}

// ══════════════════════════════════════════
//  Emergency Escape
// ══════════════════════════════════════════

#[test]
fn test_manager_emergency_escape() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.emergency_escape();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::Emergency, 'emergency state');
}

#[test]
#[should_panic]
fn test_manager_emergency_escape_non_owner_reverts() {
    let sys = deploy_full_system(6500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.emergency_escape();
    stop_cheat_caller_address(sys.manager_addr);
}

// ══════════════════════════════════════════
//  Escape Rebalance (No Position)
// ══════════════════════════════════════════

#[test]
fn test_manager_escape_no_position_transitions_state() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::VesuLending, 'escaped to VesuLending');
}

// ══════════════════════════════════════════
//  Return Rebalance
// ══════════════════════════════════════════

#[test]
fn test_manager_return_no_vesu_assets_transitions_state() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);

    // Escape
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::VesuLending, 'after escape');

    // Price back to range
    set_mock_price(sys.oracle, 6500000000000);
    assert(sys.manager.check_rebalance() == true, 'return needed');

    // Return rebalance
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.get_state() == VaultState::EkuboActive, 'returned to EkuboActive');
}

// ══════════════════════════════════════════
//  Emergency Cannot Rebalance
// ══════════════════════════════════════════

#[test]
#[should_panic(expected: 'IN_EMERGENCY')]
fn test_manager_rebalance_in_emergency_reverts() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.emergency_escape();
    stop_cheat_caller_address(sys.manager_addr);

    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
}

#[test]
fn test_manager_check_rebalance_in_emergency_returns_false() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);
    start_cheat_caller_address(sys.manager_addr, OWNER());
    sys.manager.emergency_escape();
    stop_cheat_caller_address(sys.manager_addr);
    assert(sys.manager.check_rebalance() == false, 'emergency: no rebalance');
}

// ══════════════════════════════════════════
//  VesuLending: Price Still Out
// ══════════════════════════════════════════

#[test]
#[should_panic(expected: 'PRICE_OUT_OF_RANGE')]
fn test_manager_return_when_still_out_of_range_reverts() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);

    // Escape
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);

    // Price still out → return should fail
    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);
}

#[test]
fn test_manager_check_rebalance_vesu_price_still_out() {
    let sys = deploy_full_system(5500000000000, 6000000000000, 7000000000000);

    start_cheat_caller_address(sys.manager_addr, KEEPER());
    sys.manager.rebalance();
    stop_cheat_caller_address(sys.manager_addr);

    assert(sys.manager.check_rebalance() == false, 'still out: no rebalance');
}
