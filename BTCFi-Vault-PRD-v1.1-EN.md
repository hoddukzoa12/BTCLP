# BTCFi Strategy Vault — Product Requirements Document

**Domain-Driven Design Architecture**

| Field | Value |
|-------|-------|
| Project | Starknet BTCFi Hackathon (BUIDL CTC) |
| Version | **1.1** |
| Date | 2026-03-01 |
| Target | **Starknet Sepolia Testnet** (demo) / Mainnet (production) |
| Stack | Cairo 2.14 + Scarb + snforge |
| Protocols | Ekubo + Vesu V2 + Pragma |
| Asset | wBTC/USDC (strkBTC-ready) |
| Deadline | 2026-03-10 |

> **v1.1 Changelog (2026-03-01):**
> - Added verified Sepolia testnet addresses from Ekubo official docs, Pragma docs, Starkgate
> - Corrected Mainnet Ekubo Core address to official `0x00000005dd3D...` (was using Positions address)
> - Added Ekubo Positions NFT address (both networks)
> - Added deployment strategy table (Local → Sepolia → Mainnet)
> - Documented Manager separation rationale (DDD, Phase 3 keeper upgrade path)
> - Marked wBTC Sepolia and Vesu V2 Sepolia as requiring on-chain verification
> - Added Sepolia-specific risk: testnet liquidity for demo

---

## 1. Executive Summary

### 1.1 Problem Statement

Starknet's BTCFi ecosystem has concentrated liquidity (Ekubo) and lending markets (Vesu V2) but **no automated vault that intelligently switches between them based on market conditions**. When BTC price moves outside a concentrated LP range, user capital earns **0% yield** while sitting idle in the pool. This is a significant capital efficiency problem.

### 1.2 Solution

**BTCFi Strategy Vault**: A single-asset deposit vault (ERC-4626) that automatically allocates BTC assets between Ekubo concentrated LP and Vesu V2 lending, using Pragma oracle price feeds to detect out-of-range conditions and execute strategy switches. User capital never sits idle.

### 1.3 Core Value Proposition

| Scenario | Re7 / Others | Manual LP | Our Vault |
|----------|-------------|-----------|-----------|
| **In Range** | LP fee earning | LP fee earning | LP fee earning |
| **Out of Range** | Re-range (IL crystallized) | 0% yield (idle) | **Auto Vesu lending (3-5% APY)** |
| **High Volatility** | Repeated re-range = cumulative IL | 0% yield | **Stay in Vesu until stable** |
| **Return to Range** | Already re-ranged | Manual re-entry | **Auto LP re-entry** |

### 1.4 Key Metric

**Success Criteria:** Zero idle capital time. When out-of-range is detected, capital moves to Vesu within 1 rebalance cycle.

---

## 2. Strategic Context

### 2.1 Market Opportunity

- Starknet TVL: ~$560-635M (Feb 2026), BTCFi Season 100M STRK incentives active until March 2026
- strkBTC announced Feb 26, 2026 (privacy-enabled wrapped BTC) — mainnet coming Q1 2026
- No existing vault on Starknet (or any L2) publicly implements out-of-range → lending escape logic
- Re7 Labs: Ekubo LP auto-rebalance ($10M+ TVL) — range adjustment only, no lending switch
- Troves.fi: Meta-vault with multi-strategy — allocation-based, not range-trigger-based

### 2.2 Competitive Positioning

We do NOT compete with Re7 on LP range optimization. We complement it by solving the **out-of-range capital efficiency problem** that Re7 does not address. Our vault is the safety net for when LP positions become inactive.

### 2.3 Hackathon Scope

| Phase 1: Hackathon | Phase 2: Post-Hackathon | Phase 3: Product |
|---------------------|------------------------|------------------|
| 1 vault: wBTC/USDC | Multiple vaults (BTC pairs) | Curator-created vaults |
| Binary strategy switch (LP vs Vesu) | GARCH volatility-based decision | EGARCH + ML optimization |
| Mock Oracle for demo | Pragma mainnet live | Pragma + TWAP + custom feeds |
| Owner-triggered rebalance | Keeper-automated rebalance | Off-chain GARCH + on-chain execution |
| strkBTC-ready architecture | strkBTC native support | strkBTC privacy mode vault |
| **Sepolia testnet deployment** | Mainnet deployment | Multi-chain |

---

## 3. Domain-Driven Design Model

### 3.1 Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Vault** | ERC-4626 contract that accepts user deposits, mints shares, and delegates capital to Strategies |
| **Strategy** | A contract that deploys capital into a specific DeFi protocol (Ekubo LP or Vesu Lending) |
| **Manager** | Orchestrator that reads oracle data and decides when/how to switch between Strategies |
| **Rebalance** | The act of moving capital between Strategies based on market conditions |
| **Range** | The tick bounds [lower, upper] of an Ekubo concentrated LP position |
| **In Range** | Current BTC price is within the LP tick bounds → position is active, earning fees |
| **Out of Range** | Current BTC price is outside LP tick bounds → position is inactive, earning 0% |
| **Escape** | Withdrawing all capital from Ekubo LP and depositing into Vesu Lending when out-of-range |
| **Return** | Withdrawing from Vesu and re-entering Ekubo LP when price returns to range |
| **Buffer** | Percentage of vault assets held as liquid tokens for instant withdrawals (default 10%) |
| **Share** | ERC-20 token representing proportional ownership of vault assets |
| **Idle Capital** | Capital earning 0% yield — the problem we solve |

### 3.2 Bounded Contexts

#### 3.2.1 Vault Context (Core Domain)

**Responsibility:** User-facing deposit/withdraw, share accounting, asset custody.

| Aggregate | Entities | Value Objects | Domain Events |
|-----------|----------|---------------|---------------|
| BTCFiVault | VaultShare (ERC-20), VaultConfig | DepositAmount, AllocationBPS, BufferRatio | UserDeposited, UserWithdrawn, AllocationChanged |

**Invariants:**
- `total_shares * share_price = total_assets` (always)
- `ekubo_bps + vesu_bps + buffer_bps = 10000` (always)
- `buffer >= 10%` of total_assets (soft target, enforced on rebalance)
- No deposit/withdraw when paused

#### 3.2.2 Strategy Context (Core Domain)

**Responsibility:** Protocol-specific capital deployment and withdrawal.

| Aggregate | Entities | Value Objects | Domain Events |
|-----------|----------|---------------|---------------|
| EkuboLPStrategy | LPPosition (NFT), PoolConfig | PoolKey, Bounds (ticks), Liquidity, DepositRatio | LiquidityDeposited, LiquidityWithdrawn, FeesCollected |
| VesuLendingStrategy | LendingPosition, PoolRef | CollateralAmount, CollateralShares, UtilizationRate | Supplied, Withdrawn |

**Invariants:**
- Only Vault can call Strategy deposit/withdraw (access control)
- EkuboLPStrategy: bounds must be set before first deposit
- EkuboLPStrategy: cannot change bounds while position exists (withdraw first)
- VesuLending: `collateral_amount >= 0` (no negative positions)

#### 3.2.3 Oracle & Decision Context (Supporting Domain)

**Responsibility:** Price feeds, range detection, strategy switching decisions.

| Aggregate | Entities | Value Objects | Domain Events |
|-----------|----------|---------------|---------------|
| BTCFiManager | OracleConfig, AllocationPolicy | BTCPrice, RangeStatus, VolatilityEstimate, StalenessThreshold | Rebalanced, EscapeTriggered, ReturnTriggered, Harvested |

**Invariants:**
- Oracle price must not be stale (`< max_staleness` seconds)
- Oracle must have `>= 3` aggregated sources
- Rebalance decision is deterministic given same inputs

> **Design Decision — Manager Separation (v1.1)**
>
> BTCFiManager remains a **separate contract** from BTCFiVault. Rationale:
>
> 1. **DDD principle:** Vault = asset custody & accounting (Core Domain), Manager = decision logic & oracle integration (Supporting Domain). Different rates of change, different reasons to modify.
> 2. **Phase 3 upgrade path:** GARCH keeper replaces Manager's `execute_rebalance()` without touching Vault. If merged, Phase 3 requires vault migration or re-separation.
> 3. **Audit surface:** Vault holds all funds but has simple logic. Manager has complex logic but holds no funds. Separate audit scopes reduce risk.
> 4. **Practical overhead is negligible:** One extra `sncast deploy` in the deployment script. 5 contracts vs 4 is not meaningfully different.
>
> Hackathon judges asking "why separate?" gets a DDD architecture explanation — a scoring advantage, not a liability.

#### 3.2.4 Testing & Demo Context (Generic Subdomain)

**Responsibility:** Mock contracts for testnet demo and fork testing.

| Component | Purpose | Approach |
|-----------|---------|----------|
| MockPragmaOracle | Controllable BTC price for demo | `set_price()` + IPragmaABI interface |
| Narrow Range Config | Trigger out-of-range on testnet | Bounds: current_price ± $100 |
| snforge Fork Tests | Verify against real mainnet state | Fork Starknet mainnet block |

---

## 4. Context Map & Contract Architecture

### 4.1 Context Map

```
┌─────────────────────────────────────────────────────┐
│          User (wBTC deposit / withdraw)              │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────┐
│    VAULT CONTEXT (Core Domain)                       │
│    BTCFiVault (ERC-4626)                             │
│    - deposit / withdraw / redeem                     │
│    - share accounting                                │
│    - allocation config (ekubo_bps / vesu_bps)        │
└────────────┬─────────────────────┬──────────────────┘
             │                     │
┌────────────┴──────────┐  ┌──────┴───────────────────┐
│ STRATEGY CONTEXT      │  │ STRATEGY CONTEXT          │
│ EkuboLPStrategy       │  │ VesuLendingStrategy       │
│ - deposit_liquidity   │  │ - supply                  │
│ - withdraw_liquidity  │  │ - withdraw                │
│ - collect_fees        │  │ - total_assets            │
└─────────┬─────────────┘  └──────┬───────────────────┘
          │                       │
   [Ekubo Protocol]        [Vesu V2 Pool]
   Positions + Core         modify_position

┌─────────────────────────────────────────────────────┐
│    ORACLE & DECISION CONTEXT (Supporting)            │
│    BTCFiManager                                      │
│    - execute_rebalance (reads oracle, decides)       │
│    - harvest_and_compound                            │
│    - is_in_range → LP or Vesu decision               │
└────────────────────┬────────────────────────────────┘
                     │
              [Pragma Oracle]
              get_data_median(BTC/USD)
```

### 4.2 Anti-Corruption Layers

Each external protocol is accessed through vendored interfaces (Anti-Corruption Layer pattern). Our contracts never depend on external protocol source code directly.

| External Protocol | ACL (Vendored Interface) | Source of Truth |
|-------------------|--------------------------|-----------------|
| Ekubo | `interfaces/ekubo.cairo` (IEkuboPositions, IMathLib, IEkuboCore) | starknet_vault_kit + ekubo-protocol/abis |
| Vesu V2 | `interfaces/vesu.cairo` (IVesuPool, ModifyPositionParams, Amount) | vesu-v2/src/pool.cairo |
| Pragma | `interfaces/pragma.cairo` (IPragmaABI, DataType, PragmaPricesResponse) | vesu-v2/vendor/pragma.cairo |

---

## 5. Core Domain Logic: Rebalance State Machine

### 5.1 State Diagram

```
┌─────────────────┐     price enters range     ┌─────────────────┐
│  EKUBO_LP_ACTIVE │ ◀──────────────────────── │  VESU_LENDING    │
│ (earning LP fees)│                            │ (earning lend    │
│                  │ ──────────────────────────▶│  yield)          │
└────────┬────────┘     price exits range       └────────┬────────┘
         │                                               │
         │            ┌────────────────┐                 │
         └───────────▶│   EMERGENCY    │◀────────────────┘
        owner calls   │ (all to buffer)│   owner calls
        emergency     └────────────────┘   emergency
```

### 5.2 Rebalance Decision Logic

```
fn execute_rebalance():
    // 1. Validate oracle
    btc_price = pragma.get_data_median(BTC/USD)
    assert(now - btc_price.timestamp <= MAX_STALENESS)
    assert(btc_price.num_sources >= 3)

    // 2. Check LP range status
    (ratio0, ratio1) = ekubo_strategy.get_deposit_ratio()
    in_range = ratio0 > 5% AND ratio1 > 5%

    // 3. Decide
    current_state = get_current_allocation_state()

    if in_range AND current_state == VESU:
        // RETURN: price came back, re-enter LP
        vesu_strategy.withdraw(all)
        ekubo_strategy.deposit_liquidity(amount0, amount1)
        emit ReturnTriggered

    if NOT in_range AND current_state == EKUBO:
        // ESCAPE: price left range, flee to lending
        ekubo_strategy.withdraw_liquidity(100%)
        ekubo_strategy.collect_fees()
        vesu_strategy.supply(withdrawn_btc)
        emit EscapeTriggered

    // else: no action needed (already optimal)
```

### 5.3 Buffer Management

The vault maintains a 10% buffer of liquid wBTC for instant user withdrawals. This avoids the latency and gas cost of pulling from strategies for small withdrawals.

```
fn _ensure_liquidity(needed: u256):
    buffer = wbtc.balance_of(vault_address)
    if buffer >= needed: return  // buffer covers it

    deficit = needed - buffer

    // Priority 1: Pull from Vesu (instant, no IL)
    vesu_available = vesu_strategy.total_assets()
    if vesu_available >= deficit:
        vesu_strategy.withdraw(deficit)
        return

    // Priority 2: Pull from Ekubo (may have IL)
    if vesu_available > 0:
        vesu_strategy.withdraw(vesu_available)
    remaining = deficit - vesu_available
    ekubo_strategy.withdraw_liquidity(ratio_for(remaining))
```

---

## 6. Contract Specifications

### 6.1 BTCFiVault.cairo

| Category | Interface | Access |
|----------|-----------|--------|
| **ERC-4626** | `deposit(assets, receiver) → shares`, `withdraw(assets, receiver, owner) → shares`, `redeem(shares, receiver, owner) → assets`, `total_assets() → u256`, `convert_to_shares/assets()` | Anyone (not paused) |
| **Management** | `set_allocation(ekubo_bps, vesu_bps)`, `rebalance()`, `emergency_withdraw()` | Owner / Manager |
| **View** | `total_strategy_assets()`, `ekubo_allocation_bps()`, `vesu_allocation_bps()`, `is_paused()` | Anyone |

### 6.2 EkuboLPStrategy.cairo

| Category | Interface | Access |
|----------|-----------|--------|
| **Core** | `deposit_liquidity(amount0, amount1)`, `withdraw_liquidity(ratio_wad, min0, min1)`, `collect_fees()` | Vault only |
| **View** | `total_assets_in_btc() → u256`, `underlying_balance() → (u256, u256)`, `pending_fees() → (u256, u256)`, `total_liquidity() → u256`, `get_deposit_ratio() → (u256, u256)`, `nft_id() → u64` | Anyone |
| **Config** | `set_bounds(lower, upper)` | Owner only (no existing position) |

### 6.3 VesuLendingStrategy.cairo

| Category | Interface | Access |
|----------|-----------|--------|
| **Core** | `supply(amount)`, `withdraw(amount)` | Vault only |
| **View** | `total_assets() → u256`, `current_apy() → u256` | Anyone |
| **Config** | `set_pool(pool_address)` | Owner only |

### 6.4 BTCFiManager.cairo

| Category | Interface | Access |
|----------|-----------|--------|
| **Core** | `execute_rebalance()`, `harvest_and_compound()` | Owner only |
| **View** | `get_btc_price() → (u128, u32)`, `is_in_range() → bool`, `recommended_allocation() → (u16, u16)` | Anyone |
| **Config** | `set_rebalance_threshold_bps(threshold)`, `set_max_price_staleness(seconds)` | Owner only |

### 6.5 MockPragmaOracle.cairo (Demo Only)

| Category | Interface | Access |
|----------|-----------|--------|
| **Mock** | `set_price(price_u128)`, `set_decimals(decimals)`, `set_num_sources(n)` | Owner only |
| **IPragmaABI** | `get_data_median(DataType) → PragmaPricesResponse` (returns mock values) | Anyone |

---

## 7. User Flows

### 7.1 Deposit Flow

```
User                    Vault                   ERC20(wBTC)
 │                        │                        │
 │── approve(vault, amt) ─▶│                        │
 │                        │                        │
 │── deposit(amt, self) ──▶│                        │
 │                        │── transferFrom(user) ──▶│
 │                        │                        │
 │                        │── mint(shares, user)    │
 │                        │                        │
 │◀── shares returned ────│                        │
```

### 7.2 Escape Flow (Out of Range)

```
Manager           Vault         EkuboLP         VesuLending    Pragma
 │                  │              │                │             │
 │─get_btc_price()─▶│              │                │◀──get_data──│
 │                  │              │                │             │
 │─is_in_range()──▶ │              │                │             │
 │  returns FALSE   │              │                │             │
 │                  │              │                │             │
 │─execute_rebalance▶│              │                │             │
 │                  │─withdraw(100%)▶│                │             │
 │                  │◀─wBTC returned─│                │             │
 │                  │──supply(wBTC)──────────────────▶│             │
 │                  │              │   earning 3-5%  │             │
```

### 7.3 Return Flow (Back in Range)

Reverse of Escape: Manager detects price returning to range, withdraws from Vesu, re-deposits into Ekubo LP at the same tick bounds.

### 7.4 Withdrawal Flow

```
User              Vault              VesuLending      EkuboLP
 │                  │                    │               │
 │─redeem(shares)──▶│                    │               │
 │                  │─check buffer       │               │
 │                  │  buffer >= needed?  │               │
 │                  │  YES → transfer     │               │
 │                  │  NO → pull deficit  │               │
 │                  │──withdraw(deficit)─▶│  (priority 1) │
 │                  │──withdraw(remain)──────────────────▶│ (priority 2)
 │◀─wBTC transferred─│                    │               │
```

---

## 8. Demo Scenario (Hackathon)

### 8.1 Setup

- Deploy all contracts on **Starknet Sepolia**
- Deploy MockPragmaOracle with `set_price($100,000)`
- Deploy BTCFiVault + EkuboLPStrategy (range: $99,000-$101,000) + VesuLendingStrategy
- Deploy BTCFiManager connected to all contracts
- Use Sepolia wBTC faucet or deploy mock ERC-20 for demo tokens

### 8.2 Demo Script

| # | Action | What Happens | Visual |
|---|--------|-------------|--------|
| **1** | User deposits 1 wBTC | Vault mints shares, holds 1 wBTC in buffer | Dashboard: 1 wBTC deposited, 0% allocated |
| **2** | Manager rebalances | 0.5 wBTC → Ekubo LP (in range, earning fees), 0.4 wBTC → Vesu (earning 4% APY), 0.1 wBTC → buffer | Dashboard: 50% LP / 40% Lending / 10% Buffer |
| **3** | BTC price → $105,000 (MockOracle.set_price) | LP position now OUT OF RANGE → earning 0% fees, capital idle | ⚠️ Dashboard: WARNING - Out of Range! |
| **4** | Manager rebalances | **ESCAPE:** 0.5 wBTC pulled from Ekubo LP → 0.9 wBTC now in Vesu (earning 4%), 0.1 wBTC buffer | ✅ Dashboard: 0% LP / 90% Lending / 10% Buffer — "Capital protected!" |
| **5** | BTC price → $100,000 (MockOracle.set_price) | **RETURN:** Manager detects in-range → pulls from Vesu, re-enters LP. Back to 50/40/10 split | ✅ Dashboard: 50% LP / 40% Lending / 10% Buffer — "Yield maximized!" |

### 8.3 Key Demo Message

> *"Your BTC capital never sleeps. When LP yield drops to zero, we automatically move to lending. When LP becomes profitable again, we move back. All on-chain, all automated, all verifiable."*

---

## 9. Roadmap

### Phase 1: Hackathon MVP (March 2026)

- 1 vault: wBTC/USDC pair
- Binary strategy switch: Ekubo LP ↔ Vesu Lending
- MockPragmaOracle for demo
- Owner-triggered rebalance
- ERC-4626 deposit/withdraw
- snforge fork tests
- **Deploy on Sepolia testnet**

### Phase 2: Production Alpha (Q2 2026)

- strkBTC native support (privacy mode vault)
- Keeper-automated rebalance (cron-based off-chain trigger)
- Multiple vault types (Conservative / Aggressive)
- Pragma mainnet live oracle (replace mock)
- Fee structure (management + performance fees)

### Phase 3: Quantitative Upgrade (Q3-Q4 2026)

- **GARCH(1,1) volatility prediction** via off-chain keeper
  - σ(predicted) high → stay in Vesu (avoid IL from repeated re-range)
  - σ(predicted) low → re-range LP (maximize fee income in sideways market)
- Pragma realized volatility feed as GARCH input
- Upgrade to **EGARCH / GJR-GARCH** for asymmetric BTC volatility
- On-chain σ threshold parameter controlled by governance
- Tokenized yield token (y-strkBTC) for composability
- Curator system: permissionless vault creation with custom parameters

---

## 10. Technical Dependencies & Deployment

### 10.1 Build Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Cairo | 2.14.0 | Smart contract language |
| Scarb | 2.14.0 | Build system + package manager |
| snforge | 0.48.1 | Testing framework (fork testing) |
| OpenZeppelin | latest (git) | ERC-20, Ownable components |
| alexandria_math | 0.6.0 | i257 type for Vesu Amount |
| Ekubo abis | latest (git) | i129, PoolPrice, Position types |

### 10.2 External Contract Addresses

#### 10.2.1 Sepolia Testnet — Primary (Demo & Development)

> Sources: [Ekubo Official Docs](https://docs.ekubo.org/integration-guides/reference/starknet-contracts), [Pragma Docs](https://docs.pragma.build), [Starkgate Bridged Tokens](https://github.com/starknet-io/starknet-addresses)

| Contract | Sepolia Address | Status |
|----------|----------------|--------|
| **Ekubo Core** | `0x0444a09d96389aa7148f1aada508e30b71299ffe650d9c97fdaae38cb9a23384` | ✅ Verified — Ekubo docs |
| **Ekubo Positions** | `0x06a2aee84bb0ed5dded4384ddd0e40e9c1372b818668375ab8e3ec08807417e5` | ✅ Verified — Ekubo docs |
| **Ekubo Positions NFT** | `0x04afc78d6fec3b122fc1f60276f074e557749df1a77a93416451be72c435120f` | ✅ Verified — Ekubo docs |
| **Ekubo Router V3.0.13** | `0x0045f933adf0607292468ad1c1dedaa74d5ad166392590e72676a34d01d7b763` | ✅ Verified — Ekubo docs |
| **Pragma Oracle** | `0x36031daa264c24520b11d93af622c848b2499b66b41d611bac95e13cfca131a` | ✅ Verified — Pragma docs / vesu-v2 |
| **USDC** | `0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080` | ✅ Verified — Starkgate / ekubo twamm |
| **wBTC** | `0x04861Ba938Aed21f2CD7740acD3765Ac4D2974783A3218367233dE0153490CB6` | ⚠️ Needs on-chain verification |
| **Vesu V2 Pool** | TBD — query Vesu app or deploy test pool on Sepolia | ⚠️ Needs on-chain verification |

> **Action Required:** Before first Sepolia deployment, verify wBTC and Vesu V2 addresses on-chain using `starkli call`. If Vesu has no BTC pool on Sepolia, deploy a mock lending pool or hardcode a test pool address.

#### 10.2.2 Mainnet — Reference (Post-Hackathon)

> Sources: [Ekubo Official Docs](https://docs.ekubo.org/integration-guides/reference/starknet-contracts), vesu-v2 deployment.json, Starkgate

| Contract | Mainnet Address | Status |
|----------|----------------|--------|
| **Ekubo Core** | `0x00000005dd3D2F4429AF886cD1a3b08289DBcEa99A294197E9eB43b0e0325b4b` | ✅ Verified — Ekubo docs |
| **Ekubo Positions** | `0x02e0af29598b407c8716b17f6d2795eca1b471413fa03fb145a5e33722184067` | ✅ Verified — Ekubo docs |
| **Ekubo Positions NFT** | `0x07b696af58c967c1b14c9dde0ace001720635a660a8e90c565ea459345318b30` | ✅ Verified — Ekubo docs |
| **Vesu V2 Pool** | `0x451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5` | ✅ Verified — vesu-v2 deployment.json |
| **Pragma Oracle** | `0x2a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b` | ✅ Verified — Pragma docs |
| **wBTC** | `0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac` | ✅ Verified — Starkgate |
| **USDC** | `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8` | ✅ Verified — Starkgate |

### 10.3 Deployment Strategy

| Phase | Network | Oracle | Token | Notes |
|-------|---------|--------|-------|-------|
| **Unit Test** | Local (snforge) | Mock | Mock ERC-20 | Pure logic tests, no external deps |
| **Fork Test** | snforge `#[fork("mainnet")]` | Real Pragma | Real wBTC | Verify against live mainnet state |
| **Demo** | **Sepolia** | MockPragmaOracle | Sepolia wBTC or mock | Controllable price for live demo |
| **Production** | Mainnet | Pragma live | Real wBTC | Phase 2+ |

### 10.4 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Oracle manipulation | Wrong rebalance decision | Min 3 sources, staleness check, TWAP (Phase 2) |
| Impermanent loss | Asset value reduction | Auto-escape reduces IL exposure time |
| Smart contract bug | Loss of funds | Fork tests, emergency_withdraw, OpenZeppelin base |
| Vesu insolvency | Locked collateral | Monitor utilization, max allocation cap |
| Gas cost of rebalance | Eats into yield | Threshold-based trigger (min 5% deviation) |
| strkBTC delay | No privacy feature at launch | wBTC fallback, asset-agnostic architecture |
| Sepolia wBTC liquidity | No real Ekubo pool on testnet | Deploy mock tokens + create test pool, or use narrow range on existing pool |
| Vesu V2 Sepolia absence | Cannot test lending strategy | Deploy mock Vesu or test against mainnet fork |
