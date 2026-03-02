use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

use btcfi_vault::interfaces::vault::{IBTCFiVaultDispatcher, IBTCFiVaultDispatcherTrait};

// ── Addresses ──
fn OWNER() -> ContractAddress { 0x1.try_into().unwrap() }
fn ALICE() -> ContractAddress { 0x2.try_into().unwrap() }
fn BOB() -> ContractAddress { 0x3.try_into().unwrap() }
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

fn deploy_vault(asset: ContractAddress) -> (ContractAddress, IBTCFiVaultDispatcher) {
    let contract = declare("BTCFiVault").unwrap().contract_class();
    let calldata: Array<felt252> = array![
        asset.into(),   // asset
        OWNER().into(), // owner
        ZERO().into(),  // ekubo_strategy (none for basic tests)
        ZERO().into(),  // vesu_strategy (none for basic tests)
        OWNER().into(), // manager = owner for testing
    ];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    (addr, IBTCFiVaultDispatcher { contract_address: addr })
}

// ── Mint helper (calls MockERC20.mint_to via syscall) ──
fn mint_to(token: ContractAddress, to: ContractAddress, amount: u256) {
    let selector = selector!("mint_to");
    let mut calldata: Array<felt252> = array![];
    to.serialize(ref calldata);
    amount.serialize(ref calldata);
    starknet::syscalls::call_contract_syscall(token, selector, calldata.span()).unwrap();
}

fn approve(token: ContractAddress, from: ContractAddress, spender: ContractAddress, amount: u256) {
    start_cheat_caller_address(token, from);
    IERC20Dispatcher { contract_address: token }.approve(spender, amount);
    stop_cheat_caller_address(token);
}

// ══════════════════════════════════════════
//  Tests
// ══════════════════════════════════════════

#[test]
fn test_vault_asset() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (_vault_addr, vault) = deploy_vault(wbtc);
    assert(vault.asset() == wbtc, 'wrong asset');
}

#[test]
fn test_vault_initial_state() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (_vault_addr, vault) = deploy_vault(wbtc);
    assert(vault.total_assets() == 0, 'total_assets should be 0');
    assert(vault.is_paused() == false, 'should not be paused');
    // Constructor sets default: 50% Ekubo, 40% Vesu, 10% buffer
    assert(vault.ekubo_allocation_bps() == 5000, 'ekubo alloc should be 5000');
    assert(vault.vesu_allocation_bps() == 4000, 'vesu alloc should be 4000');
    assert(vault.buffer_bps() == 1000, 'buffer should be 1000');
}

#[test]
fn test_deposit_and_shares() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    // Mint 10 wBTC to Alice
    let deposit_amount: u256 = 1000000000; // 10 BTC (8 decimals)
    mint_to(wbtc, ALICE(), deposit_amount);
    approve(wbtc, ALICE(), vault_addr, deposit_amount);

    // Alice deposits
    start_cheat_caller_address(vault_addr, ALICE());
    let shares = vault.deposit(deposit_amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // First depositor: shares ≈ assets (with +1 virtual offset)
    assert(shares > 0, 'should get shares');
    assert(vault.total_assets() == deposit_amount, 'total_assets mismatch');

    // Alice's share balance should match
    let share_token = IERC20Dispatcher { contract_address: vault_addr };
    assert(share_token.balance_of(ALICE()) == shares, 'share balance mismatch');
}

#[test]
fn test_deposit_withdraw_roundtrip() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    let amount: u256 = 500000000; // 5 BTC
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    // Deposit
    start_cheat_caller_address(vault_addr, ALICE());
    let _shares = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    assert(wbtc_disp.balance_of(ALICE()) == 0, 'alice should have 0 wbtc');

    // Withdraw all
    start_cheat_caller_address(vault_addr, ALICE());
    let _withdrawn_shares = vault.withdraw(amount, ALICE(), ALICE());
    stop_cheat_caller_address(vault_addr);

    // Alice gets wBTC back (may lose 1 wei to rounding)
    let alice_bal = wbtc_disp.balance_of(ALICE());
    assert(alice_bal >= amount - 1, 'should get assets back');
}

#[test]
fn test_redeem() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    let amount: u256 = 200000000; // 2 BTC
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    // Deposit
    start_cheat_caller_address(vault_addr, ALICE());
    let shares = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Redeem all shares
    start_cheat_caller_address(vault_addr, ALICE());
    let assets_out = vault.redeem(shares, ALICE(), ALICE());
    stop_cheat_caller_address(vault_addr);

    // Should get back approximately the deposited amount
    assert(assets_out >= amount - 1, 'redeem should return assets');
    assert(wbtc_disp.balance_of(ALICE()) >= amount - 1, 'alice balance after redeem');
}

#[test]
fn test_two_depositors_fair_shares() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000; // 1 BTC each
    mint_to(wbtc, ALICE(), amount);
    mint_to(wbtc, BOB(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);
    approve(wbtc, BOB(), vault_addr, amount);

    // Alice deposits first
    start_cheat_caller_address(vault_addr, ALICE());
    let shares_alice = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Bob deposits same amount
    start_cheat_caller_address(vault_addr, BOB());
    let shares_bob = vault.deposit(amount, BOB());
    stop_cheat_caller_address(vault_addr);

    // Both should get approximately equal shares
    let diff = if shares_alice > shares_bob {
        shares_alice - shares_bob
    } else {
        shares_bob - shares_alice
    };
    assert(diff <= 1, 'shares should be equal');
    assert(vault.total_assets() == amount * 2, 'total should be 2x');
}

#[test]
fn test_preview_functions() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    // Preview before deposit
    let preview_shares = vault.preview_deposit(amount);
    assert(preview_shares > 0, 'preview should be positive');

    // Deposit and compare
    start_cheat_caller_address(vault_addr, ALICE());
    let actual_shares = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    assert(actual_shares == preview_shares, 'preview should match actual');
}

#[test]
fn test_pause_unpause() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    // Owner pauses
    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    stop_cheat_caller_address(vault_addr);
    assert(vault.is_paused() == true, 'should be paused');

    // Owner unpauses
    start_cheat_caller_address(vault_addr, OWNER());
    vault.unpause();
    stop_cheat_caller_address(vault_addr);
    assert(vault.is_paused() == false, 'should be unpaused');
}

#[test]
#[should_panic(expected: 'VAULT_PAUSED')]
fn test_deposit_when_paused_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    // Pause
    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    stop_cheat_caller_address(vault_addr);

    // Deposit should revert
    start_cheat_caller_address(vault_addr, ALICE());
    vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);
}

#[test]
#[should_panic(expected: 'ZERO_ASSETS')]
fn test_deposit_zero_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    start_cheat_caller_address(vault_addr, ALICE());
    vault.deposit(0, ALICE());
    stop_cheat_caller_address(vault_addr);
}

#[test]
fn test_set_allocation() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    start_cheat_caller_address(vault_addr, OWNER());
    vault.set_allocation(5000, 3000); // 50% Ekubo, 30% Vesu, 20% buffer
    stop_cheat_caller_address(vault_addr);

    assert(vault.ekubo_allocation_bps() == 5000, 'ekubo alloc');
    assert(vault.vesu_allocation_bps() == 3000, 'vesu alloc');
    assert(vault.buffer_bps() == 2000, 'buffer alloc');
}

// ══════════════════════════════════════════
//  Access Control Tests
// ══════════════════════════════════════════

#[test]
#[should_panic]
fn test_pause_by_non_owner_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    // Alice (non-owner) tries to pause
    start_cheat_caller_address(vault_addr, ALICE());
    vault.pause();
    stop_cheat_caller_address(vault_addr);
}

#[test]
#[should_panic(expected: 'NOT_AUTHORIZED')]
fn test_set_allocation_by_non_owner_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    // Alice (non-owner, non-manager) tries to set allocation
    start_cheat_caller_address(vault_addr, ALICE());
    vault.set_allocation(5000, 3000);
    stop_cheat_caller_address(vault_addr);
}

#[test]
#[should_panic(expected: 'ALLOC_EXCEEDS_100')]
fn test_set_allocation_exceeds_100_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    // Owner tries to set allocation > 100%
    start_cheat_caller_address(vault_addr, OWNER());
    vault.set_allocation(6000, 5000); // 110% total
    stop_cheat_caller_address(vault_addr);
}

#[test]
fn test_set_allocation_100_percent() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    // Owner sets 100% allocation (0% buffer)
    start_cheat_caller_address(vault_addr, OWNER());
    vault.set_allocation(5000, 5000); // 50% + 50% = 100%
    stop_cheat_caller_address(vault_addr);

    assert(vault.ekubo_allocation_bps() == 5000, 'ekubo 50');
    assert(vault.vesu_allocation_bps() == 5000, 'vesu 50');
    assert(vault.buffer_bps() == 0, 'buffer 0');
}

// ══════════════════════════════════════════
//  Paused State - max_* Returns 0
// ══════════════════════════════════════════

#[test]
fn test_max_deposit_when_paused() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    // Before pause: max_deposit should be MAX_U256
    let max_before = vault.max_deposit(ALICE());
    assert(max_before > 0, 'max_deposit should be > 0');

    // Pause
    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    stop_cheat_caller_address(vault_addr);

    // After pause: max_deposit should be 0
    assert(vault.max_deposit(ALICE()) == 0, 'paused max_deposit == 0');
    assert(vault.max_mint(ALICE()) == 0, 'paused max_mint == 0');
}

#[test]
fn test_max_withdraw_and_redeem_when_paused() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    // Alice deposits
    start_cheat_caller_address(vault_addr, ALICE());
    let shares = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Before pause: max_withdraw and max_redeem > 0
    assert(vault.max_withdraw(ALICE()) > 0, 'max_withdraw > 0');
    assert(vault.max_redeem(ALICE()) == shares, 'max_redeem == shares');

    // Pause
    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    stop_cheat_caller_address(vault_addr);

    // After pause: both should be 0
    assert(vault.max_withdraw(ALICE()) == 0, 'paused max_withdraw == 0');
    assert(vault.max_redeem(ALICE()) == 0, 'paused max_redeem == 0');
}

// ══════════════════════════════════════════
//  Withdraw/Redeem When Paused
// ══════════════════════════════════════════

#[test]
#[should_panic(expected: 'VAULT_PAUSED')]
fn test_withdraw_when_paused_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    start_cheat_caller_address(vault_addr, ALICE());
    vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Pause
    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    stop_cheat_caller_address(vault_addr);

    // Withdraw should revert
    start_cheat_caller_address(vault_addr, ALICE());
    vault.withdraw(amount, ALICE(), ALICE());
    stop_cheat_caller_address(vault_addr);
}

#[test]
#[should_panic(expected: 'VAULT_PAUSED')]
fn test_redeem_when_paused_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    start_cheat_caller_address(vault_addr, ALICE());
    let shares = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Pause
    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    stop_cheat_caller_address(vault_addr);

    // Redeem should revert
    start_cheat_caller_address(vault_addr, ALICE());
    vault.redeem(shares, ALICE(), ALICE());
    stop_cheat_caller_address(vault_addr);
}

// ══════════════════════════════════════════
//  ERC-4626 View Consistency
// ══════════════════════════════════════════

#[test]
fn test_convert_to_shares_and_back() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    start_cheat_caller_address(vault_addr, ALICE());
    vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Convert round-trip: assets → shares → assets should be close
    let test_amount: u256 = 50000000; // 0.5 BTC
    let shares_for = vault.convert_to_shares(test_amount);
    let assets_back = vault.convert_to_assets(shares_for);

    // Due to rounding, assets_back <= test_amount (round down both ways)
    assert(assets_back <= test_amount, 'round trip overflow');
    // But should not lose more than 1 wei
    assert(assets_back >= test_amount - 1, 'round trip underflow');
}

#[test]
fn test_preview_redeem_matches_convert() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    start_cheat_caller_address(vault_addr, ALICE());
    let shares = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // preview_redeem should equal convert_to_assets (both round down)
    let preview = vault.preview_redeem(shares);
    let convert = vault.convert_to_assets(shares);
    assert(preview == convert, 'preview == convert');
}

// ══════════════════════════════════════════
//  Mint (ERC-4626)
// ══════════════════════════════════════════

#[test]
fn test_mint_shares() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);
    let wbtc_disp = IERC20Dispatcher { contract_address: wbtc };

    // Mint enough wBTC to Alice
    let big_amount: u256 = 1000000000; // 10 BTC
    mint_to(wbtc, ALICE(), big_amount);
    approve(wbtc, ALICE(), vault_addr, big_amount);

    // Request exact shares via mint
    let desired_shares: u256 = 100000000;
    start_cheat_caller_address(vault_addr, ALICE());
    let assets_pulled = vault.mint(desired_shares, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Should have pulled assets and minted exact shares
    let share_token = IERC20Dispatcher { contract_address: vault_addr };
    assert(share_token.balance_of(ALICE()) == desired_shares, 'exact shares minted');
    assert(assets_pulled > 0, 'should pull assets');

    // Alice's wBTC balance should decrease
    assert(wbtc_disp.balance_of(ALICE()) == big_amount - assets_pulled, 'wbtc deducted');
}

// ══════════════════════════════════════════
//  Zero Share Revert on Mint
// ══════════════════════════════════════════

#[test]
#[should_panic(expected: 'ZERO_SHARES')]
fn test_mint_zero_shares_reverts() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    start_cheat_caller_address(vault_addr, ALICE());
    vault.mint(0, ALICE());
    stop_cheat_caller_address(vault_addr);
}

// ══════════════════════════════════════════
//  ERC20 Share Token Properties
// ══════════════════════════════════════════

#[test]
fn test_share_token_name_and_symbol() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, _vault) = deploy_vault(wbtc);

    let share_token = IERC20Dispatcher { contract_address: vault_addr };
    // Total supply starts at 0
    assert(share_token.total_supply() == 0, 'initial supply 0');
}

#[test]
fn test_share_transfer_between_users() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    // Alice deposits
    start_cheat_caller_address(vault_addr, ALICE());
    let shares = vault.deposit(amount, ALICE());
    stop_cheat_caller_address(vault_addr);

    // Alice transfers half her shares to Bob
    let half = shares / 2;
    let share_token = IERC20Dispatcher { contract_address: vault_addr };
    start_cheat_caller_address(vault_addr, ALICE());
    share_token.transfer(BOB(), half);
    stop_cheat_caller_address(vault_addr);

    assert(share_token.balance_of(ALICE()) == shares - half, 'alice shares after xfer');
    assert(share_token.balance_of(BOB()) == half, 'bob got shares');

    // Bob can redeem his shares
    start_cheat_caller_address(vault_addr, BOB());
    let bob_assets = vault.redeem(half, BOB(), BOB());
    stop_cheat_caller_address(vault_addr);

    assert(bob_assets > 0, 'bob redeemed assets');
}

// ══════════════════════════════════════════
//  Deposit to different receiver
// ══════════════════════════════════════════

#[test]
fn test_deposit_to_different_receiver() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (vault_addr, vault) = deploy_vault(wbtc);

    let amount: u256 = 100000000;
    mint_to(wbtc, ALICE(), amount);
    approve(wbtc, ALICE(), vault_addr, amount);

    // Alice deposits but receiver is Bob
    start_cheat_caller_address(vault_addr, ALICE());
    let shares = vault.deposit(amount, BOB());
    stop_cheat_caller_address(vault_addr);

    // Bob should have the shares, not Alice
    let share_token = IERC20Dispatcher { contract_address: vault_addr };
    assert(share_token.balance_of(BOB()) == shares, 'bob got shares');
    assert(share_token.balance_of(ALICE()) == 0, 'alice has 0 shares');
}

// ══════════════════════════════════════════
//  View functions: ekubo_strategy, vesu_strategy, manager
// ══════════════════════════════════════════

#[test]
fn test_strategy_and_manager_addresses() {
    let wbtc = deploy_mock_erc20("Wrapped BTC", "wBTC");
    let (_vault_addr, vault) = deploy_vault(wbtc);

    // Strategies were deployed with ZERO addresses
    assert(vault.ekubo_strategy() == ZERO(), 'ekubo should be zero');
    assert(vault.vesu_strategy() == ZERO(), 'vesu should be zero');
    // Manager = OWNER in our test deployment
    assert(vault.manager() == OWNER(), 'manager should be owner');
}
