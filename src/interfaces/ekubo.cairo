/// Anti-Corruption Layer — Ekubo Protocol interfaces
/// Vendored from EkuboProtocol/starknet-contracts (Cairo >= 2.15.0)
/// We manually vendor because the upstream Scarb package requires Cairo 2.15+
/// while our project targets Cairo 2.14.0.
///
/// Only the types and trait methods needed by the BTCFi Vault are included.
/// Full source: https://github.com/EkuboProtocol/starknet-contracts

use starknet::ContractAddress;

// ============================================================
//  Foundational Types
// ============================================================

/// Signed 129-bit integer (magnitude + sign).
/// sign: true = negative, false = positive/zero
#[derive(Copy, Drop, Serde, Hash, PartialEq, starknet::Store)]
pub struct i129 {
    pub mag: u128,
    pub sign: bool,
}

/// Uniquely identifies a pool — token pair + fee + tick_spacing + extension
#[derive(Copy, Drop, Serde, PartialEq, Hash)]
pub struct PoolKey {
    pub token0: ContractAddress,
    pub token1: ContractAddress,
    pub fee: u128,
    pub tick_spacing: u128,
    pub extension: ContractAddress,
}

/// Tick range for a concentrated liquidity position
#[derive(Copy, Drop, Serde, PartialEq, Hash)]
pub struct Bounds {
    pub lower: i129,
    pub upper: i129,
}

/// Current pool price state
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct PoolPrice {
    pub sqrt_ratio: u256,
    pub tick: i129,
}

/// Accumulated fees per unit of liquidity
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct FeesPerLiquidity {
    pub value0: felt252,
    pub value1: felt252,
}

/// On-chain position state
#[derive(Copy, Drop, Serde)]
pub struct Position {
    pub liquidity: u128,
    pub fees_per_liquidity_inside_last: FeesPerLiquidity,
}

/// Balance change returned from update_position / collect_fees / swap
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct Delta {
    pub amount0: i129,
    pub amount1: i129,
}

/// Identifies a position within a pool
#[derive(Copy, Drop, Serde, PartialEq, Hash)]
pub struct PositionKey {
    pub salt: felt252,
    pub owner: ContractAddress,
    pub bounds: Bounds,
}

/// Parameters for update_position
#[derive(Copy, Drop, Serde)]
pub struct UpdatePositionParameters {
    pub salt: felt252,
    pub bounds: Bounds,
    pub liquidity_delta: i129,
}

/// Result from get_token_info on Positions contract
#[derive(Copy, Drop, Serde)]
pub struct GetTokenInfoResult {
    pub pool_price: PoolPrice,
    pub liquidity: u128,
    pub amount0: u128,
    pub amount1: u128,
    pub fees0: u128,
    pub fees1: u128,
}

/// Request struct for batch get_tokens_info
#[derive(Copy, Drop, Serde)]
pub struct GetTokenInfoRequest {
    pub id: u64,
    pub pool_key: PoolKey,
    pub bounds: Bounds,
}

// ============================================================
//  ICore — Ekubo Core contract interface (vault-relevant subset)
// ============================================================

#[starknet::interface]
pub trait IEkuboCore<TContractState> {
    /// Query current pool price (sqrt_ratio + tick)
    fn get_pool_price(self: @TContractState, pool_key: PoolKey) -> PoolPrice;

    /// Query total liquidity in a pool
    fn get_pool_liquidity(self: @TContractState, pool_key: PoolKey) -> u128;

    /// Add/remove liquidity to/from a position
    fn update_position(
        ref self: TContractState, pool_key: PoolKey, params: UpdatePositionParameters,
    ) -> Delta;

    /// Collect accumulated trading fees for a position
    fn collect_fees(
        ref self: TContractState, pool_key: PoolKey, salt: felt252, bounds: Bounds,
    ) -> Delta;

    /// Withdraw tokens owed to the caller
    fn withdraw(
        ref self: TContractState,
        token_address: ContractAddress,
        recipient: ContractAddress,
        amount: u128,
    );

    /// Notify core that tokens have been sent (pay obligation)
    fn pay(ref self: TContractState, token_address: ContractAddress);

    /// Acquire the lock for atomic multi-step operations
    fn lock(ref self: TContractState, data: Span<felt252>) -> Span<felt252>;
}

// ============================================================
//  IPositions — Ekubo Positions NFT contract (vault-relevant subset)
// ============================================================

#[starknet::interface]
pub trait IEkuboPositions<TContractState> {
    /// Mint NFT + deposit liquidity in one call. Returns (nft_id, liquidity).
    fn mint_and_deposit(
        ref self: TContractState, pool_key: PoolKey, bounds: Bounds, min_liquidity: u128,
    ) -> (u64, u128);

    /// Withdraw liquidity from NFT position. Returns (amount0, amount1).
    fn withdraw(
        ref self: TContractState,
        id: u64,
        pool_key: PoolKey,
        bounds: Bounds,
        liquidity: u128,
        min_token0: u128,
        min_token1: u128,
        collect_fees: bool,
    ) -> (u128, u128);

    /// Collect accrued trading fees. Returns (fees0, fees1).
    fn collect_fees(
        ref self: TContractState, id: u64, pool_key: PoolKey, bounds: Bounds,
    ) -> (u128, u128);

    /// Query current position value + accrued fees.
    fn get_token_info(
        self: @TContractState, id: u64, pool_key: PoolKey, bounds: Bounds,
    ) -> GetTokenInfoResult;

    /// Batch query position info.
    fn get_tokens_info(
        self: @TContractState, params: Span<GetTokenInfoRequest>,
    ) -> Span<GetTokenInfoResult>;

    /// Query pool price via Positions contract.
    fn get_pool_price(self: @TContractState, pool_key: PoolKey) -> PoolPrice;

    /// Deposit additional liquidity to an existing NFT position.
    fn deposit(
        ref self: TContractState, id: u64, pool_key: PoolKey, bounds: Bounds, min_liquidity: u128,
    ) -> u128;
}

// ============================================================
//  ILocker — Callback interface for lock pattern
// ============================================================

#[starknet::interface]
pub trait ILocker<TContractState> {
    fn locked(ref self: TContractState, id: u32, data: Span<felt252>) -> Span<felt252>;
}
