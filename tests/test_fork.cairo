/// Fork Tests — Mainnet State Verification
/// Verifies that our vendored ACL interfaces match real Starknet mainnet contracts.
/// Uses snforge #[fork("MAINNET_FORK")] to query live contract state.
///
/// Purpose:
/// - Catch ABI mismatches early (our interfaces vs actual contracts)
/// - Prove mainnet readiness to hackathon judges
/// - Validate integration against live protocol state
///
/// ⚠ NOTE: These tests are currently #[ignore] because snforge 0.57.0
/// requires RPC spec v0.10.0 but no free public RPC supports it yet
/// (Lava=v0.8.1, Cartridge=v0.9.0). The "Preconfirmed block" panic
/// is a known incompatibility. Tests will work once public RPCs catch up
/// or snforge relaxes version requirements.
///
/// Run with: snforge test test_fork --ignored
///
/// Closes #23

use starknet::ContractAddress;

// ── Our vendored interfaces ──
use btcfi_vault::interfaces::pragma::{
    IPragmaABIDispatcher, IPragmaABIDispatcherTrait, DataType, AggregationMode,
};
use btcfi_vault::interfaces::ekubo::{
    IEkuboCoreDispatcher, IEkuboCoreDispatcherTrait,
    IEkuboPositionsDispatcher, IEkuboPositionsDispatcherTrait,
    PoolKey,
};

// ── Mainnet Contract Addresses ──

// Pragma Oracle: https://docs.pragma.build/starknet/architecture
fn PRAGMA_ORACLE() -> ContractAddress {
    0x2a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b
        .try_into()
        .unwrap()
}

// Ekubo Core: https://docs.ekubo.org/integration-guides/reference/starknet-contracts
fn EKUBO_CORE() -> ContractAddress {
    0x00000005dd3D2F4429AF886cD1a3b08289DBcEa99A294197E9eB43b0e0325b4b
        .try_into()
        .unwrap()
}

// Ekubo Positions: https://docs.ekubo.org/integration-guides/reference/starknet-contracts
fn EKUBO_POSITIONS() -> ContractAddress {
    0x02e0af29598b407c8716b17f6d2795eca1b471413fa03fb145a5e33722184067
        .try_into()
        .unwrap()
}

// wBTC (StarkGate bridged): 8 decimals
fn WBTC() -> ContractAddress {
    0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac
        .try_into()
        .unwrap()
}

// USDC (StarkGate bridged): 6 decimals
fn USDC() -> ContractAddress {
    0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8
        .try_into()
        .unwrap()
}

// BTC/USD pair ID for Pragma: felt252 encoding of 'BTC/USD'
const BTC_USD_PAIR_ID: felt252 = 18669995996566340;

// ══════════════════════════════════════════════════════════════
//  1. Pragma Oracle — BTC/USD Price Feed
// ══════════════════════════════════════════════════════════════

#[test]
#[fork("MAINNET_FORK")]
#[ignore]
fn test_fork_pragma_btc_usd_price() {
    let oracle = IPragmaABIDispatcher { contract_address: PRAGMA_ORACLE() };

    // Query BTC/USD median price
    let response = oracle.get_data_median(DataType::SpotEntry(BTC_USD_PAIR_ID));

    // Price must be positive
    assert(response.price > 0, 'price must be > 0');

    // Decimals should be 8 (Pragma standard for USD pairs)
    assert(response.decimals == 8, 'decimals should be 8');

    // Must have multiple data sources (robust oracle)
    assert(response.num_sources_aggregated >= 3, 'need >= 3 sources');

    // Timestamp must be recent (non-zero)
    assert(response.last_updated_timestamp > 0, 'timestamp must be > 0');

    // Sanity check: BTC price should be between $10,000 and $500,000
    // At 8 decimals: $10k = 1_000_000_000_000, $500k = 50_000_000_000_000
    let price_lower: u128 = 1_000_000_000_000; // $10,000
    let price_upper: u128 = 50_000_000_000_000; // $500,000
    assert(response.price >= price_lower, 'BTC < $10k?');
    assert(response.price <= price_upper, 'BTC > $500k?');
}

#[test]
#[fork("MAINNET_FORK")]
#[ignore]
fn test_fork_pragma_get_data_with_aggregation() {
    let oracle = IPragmaABIDispatcher { contract_address: PRAGMA_ORACLE() };

    // Test get_data with explicit Median aggregation mode
    let response = oracle.get_data(
        DataType::SpotEntry(BTC_USD_PAIR_ID), AggregationMode::Median,
    );

    assert(response.price > 0, 'get_data price > 0');
    assert(response.decimals == 8, 'get_data decimals 8');
    assert(response.num_sources_aggregated >= 1, 'get_data sources >= 1');
}

// ══════════════════════════════════════════════════════════════
//  2. Ekubo Core — Pool Price Query
// ══════════════════════════════════════════════════════════════

#[test]
#[fork("MAINNET_FORK")]
#[ignore]
fn test_fork_ekubo_core_pool_price() {
    let core = IEkuboCoreDispatcher { contract_address: EKUBO_CORE() };

    // Construct wBTC/USDC pool key
    // Fee tier: 0.3% = 170141183460469235273462165868118016 (Ekubo's 128.128 format)
    // Tick spacing: 200
    let pool_key = PoolKey {
        token0: WBTC(),
        token1: USDC(),
        fee: 170141183460469235273462165868118016,
        tick_spacing: 200,
        extension: 0.try_into().unwrap(),
    };

    // Query pool price — if pool exists, sqrt_ratio > 0
    let pool_price = core.get_pool_price(pool_key);

    // sqrt_ratio == 0 means pool doesn't exist with these exact params,
    // which is still a valid ABI response (no revert = interface matches)
    // If pool exists, verify it has meaningful data
    if pool_price.sqrt_ratio > 0 {
        // Pool exists — great, our interface is compatible
        // tick magnitude should be reasonable (< 2^127)
        assert(pool_price.tick.mag < 170141183460469231731687303715884105728, 'tick too large');
    }
    // If sqrt_ratio == 0, the pool may not exist with this exact fee/spacing,
    // but the call succeeded without revert — ABI is compatible ✓
}

#[test]
#[fork("MAINNET_FORK")]
#[ignore]
fn test_fork_ekubo_core_pool_liquidity() {
    let core = IEkuboCoreDispatcher { contract_address: EKUBO_CORE() };

    let pool_key = PoolKey {
        token0: WBTC(),
        token1: USDC(),
        fee: 170141183460469235273462165868118016,
        tick_spacing: 200,
        extension: 0.try_into().unwrap(),
    };

    // Query total liquidity — should not revert
    let _liquidity = core.get_pool_liquidity(pool_key);
    // Successful call = ABI compatible ✓
}

// ══════════════════════════════════════════════════════════════
//  3. Ekubo Positions — Pool Price via Positions Contract
// ══════════════════════════════════════════════════════════════

#[test]
#[fork("MAINNET_FORK")]
#[ignore]
fn test_fork_ekubo_positions_get_pool_price() {
    let positions = IEkuboPositionsDispatcher { contract_address: EKUBO_POSITIONS() };

    let pool_key = PoolKey {
        token0: WBTC(),
        token1: USDC(),
        fee: 170141183460469235273462165868118016,
        tick_spacing: 200,
        extension: 0.try_into().unwrap(),
    };

    // Query pool price through Positions contract
    let pool_price = positions.get_pool_price(pool_key);

    // Same as core — if pool exists, sqrt_ratio > 0
    if pool_price.sqrt_ratio > 0 {
        assert(pool_price.tick.mag < 170141183460469231731687303715884105728, 'tick too large');
    }
    // No revert = Positions interface is ABI-compatible ✓
}

// ══════════════════════════════════════════════════════════════
//  4. ERC20 — wBTC and USDC basic queries
// ══════════════════════════════════════════════════════════════

// Minimal ERC20 interface for fork testing
#[starknet::interface]
trait IERC20View<TContractState> {
    fn name(self: @TContractState) -> ByteArray;
    fn symbol(self: @TContractState) -> ByteArray;
    fn decimals(self: @TContractState) -> u8;
    fn total_supply(self: @TContractState) -> u256;
}

#[test]
#[fork("MAINNET_FORK")]
#[ignore]
fn test_fork_wbtc_token_metadata() {
    let wbtc = IERC20ViewDispatcher { contract_address: WBTC() };

    let decimals = wbtc.decimals();
    assert(decimals == 8, 'wBTC should be 8 decimals');

    let total_supply = wbtc.total_supply();
    assert(total_supply > 0, 'wBTC supply > 0');
}

#[test]
#[fork("MAINNET_FORK")]
#[ignore]
fn test_fork_usdc_token_metadata() {
    let usdc = IERC20ViewDispatcher { contract_address: USDC() };

    let decimals = usdc.decimals();
    assert(decimals == 6, 'USDC should be 6 decimals');

    let total_supply = usdc.total_supply();
    assert(total_supply > 0, 'USDC supply > 0');
}
