#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# BTCFi Strategy Vault — Sepolia Testnet Deployment Script
# ═══════════════════════════════════════════════════════════════════
#
# Prerequisites:
#   1. sncast account funded & deployed on Sepolia
#   2. scarb build completed successfully
#   3. PATH includes: ~/.asdf/shims, ~/.local/bin
#
# Usage:
#   bash scripts/deploy_sepolia.sh
#
# Deployment order (resolves circular dependency):
#   1. Declare all contract classes
#   2. Deploy mocks: MockERC20 (wBTC, USDC), MockPragmaOracle,
#      MockEkuboPositions, MockVesuPool
#   3. Deploy BTCFiVault with zero strategy/manager addresses
#   4. Deploy EkuboLPStrategy with real vault address
#   5. Deploy VesuLendingStrategy with real vault address
#   6. Deploy BTCFiManager with all real addresses
#   7. Wire: vault.set_strategies(), vault.set_manager_addr(),
#      ekubo.set_manager(), vesu.set_manager()
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

export PATH="$HOME/.asdf/shims:$HOME/.local/bin:$PATH"

# ── Configuration ──
NETWORK="sepolia"
ACCOUNT="deployer"
ZERO_ADDR="0x0"

# Deployer address (owner of all contracts)
OWNER="0x00f08dea4d30852afcdfb27306cef969d9fcc1322b2abd9bd702f3c0becc7ad1"

# BTC price: $65,000 with 8 decimals
INITIAL_BTC_PRICE="6500000000000"
PRAGMA_DECIMALS="8"

# Ekubo pool parameters (mock values for demo)
POOL_FEE="170141183460469235273462165868118016"
POOL_TICK_SPACING="200"
POOL_ID="0x1"

# Output file for deployed addresses
DEPLOY_LOG="scripts/deployed_addresses.txt"

echo "==================================================="
echo " BTCFi Vault - Sepolia Deployment"
echo "==================================================="
echo ""

# ── Step 0: Build ──
echo "[Step 0] Building project..."
scarb build
echo "  OK: Build successful"
echo ""

# ── Helper: extract contract_address from sncast output ──
extract_addr() {
    echo "$1" | grep "contract_address:" | awk '{print $2}' | tr -d ' '
}

extract_class_hash() {
    echo "$1" | grep "class_hash:" | awk '{print $2}' | tr -d ' '
}

# ── Step 1: Declare all contracts ──
echo "[Step 1] Declaring contract classes..."

echo "  Declaring MockERC20..."
MOCK_ERC20_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name MockERC20 2>&1 || true)
MOCK_ERC20_HASH=$(extract_class_hash "$MOCK_ERC20_OUT")
echo "  -> MockERC20: $MOCK_ERC20_HASH"

echo "  Declaring MockPragmaOracle..."
MOCK_PRAGMA_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name MockPragmaOracle 2>&1 || true)
MOCK_PRAGMA_HASH=$(extract_class_hash "$MOCK_PRAGMA_OUT")
echo "  -> MockPragmaOracle: $MOCK_PRAGMA_HASH"

echo "  Declaring MockEkuboPositions..."
MOCK_EKUBO_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name MockEkuboPositions 2>&1 || true)
MOCK_EKUBO_HASH=$(extract_class_hash "$MOCK_EKUBO_OUT")
echo "  -> MockEkuboPositions: $MOCK_EKUBO_HASH"

echo "  Declaring MockVesuPool..."
MOCK_VESU_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name MockVesuPool 2>&1 || true)
MOCK_VESU_HASH=$(extract_class_hash "$MOCK_VESU_OUT")
echo "  -> MockVesuPool: $MOCK_VESU_HASH"

echo "  Declaring BTCFiVault..."
VAULT_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name BTCFiVault 2>&1 || true)
VAULT_HASH=$(extract_class_hash "$VAULT_OUT")
echo "  -> BTCFiVault: $VAULT_HASH"

echo "  Declaring EkuboLPStrategy..."
EKUBO_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name EkuboLPStrategy 2>&1 || true)
EKUBO_HASH=$(extract_class_hash "$EKUBO_OUT")
echo "  -> EkuboLPStrategy: $EKUBO_HASH"

echo "  Declaring VesuLendingStrategy..."
VESU_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name VesuLendingStrategy 2>&1 || true)
VESU_HASH=$(extract_class_hash "$VESU_OUT")
echo "  -> VesuLendingStrategy: $VESU_HASH"

echo "  Declaring BTCFiManager..."
MANAGER_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" declare --contract-name BTCFiManager 2>&1 || true)
MANAGER_HASH=$(extract_class_hash "$MANAGER_OUT")
echo "  -> BTCFiManager: $MANAGER_HASH"

echo ""
echo "[Step 2] Deploying mock contracts..."

# Deploy MockERC20 wBTC
echo "  Deploying MockERC20 (wBTC)..."
WBTC_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$MOCK_ERC20_HASH" \
    --constructor-calldata 0x1 0x577261707065642042544300000000 0x1 0x5742544300000000 2>&1)
WBTC_ADDR=$(extract_addr "$WBTC_OUT")
echo "  -> wBTC: $WBTC_ADDR"

# Deploy MockERC20 USDC
echo "  Deploying MockERC20 (USDC)..."
USDC_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$MOCK_ERC20_HASH" \
    --constructor-calldata 0x1 0x55534420436f696e00000000000000 0x1 0x5553444300000000 2>&1)
USDC_ADDR=$(extract_addr "$USDC_OUT")
echo "  -> USDC: $USDC_ADDR"

# Deploy MockPragmaOracle
echo "  Deploying MockPragmaOracle..."
ORACLE_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$MOCK_PRAGMA_HASH" \
    --constructor-calldata "$INITIAL_BTC_PRICE" "$PRAGMA_DECIMALS" 2>&1)
ORACLE_ADDR=$(extract_addr "$ORACLE_OUT")
echo "  -> Oracle: $ORACLE_ADDR"

# Deploy MockEkuboPositions (no constructor args)
echo "  Deploying MockEkuboPositions..."
POSITIONS_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$MOCK_EKUBO_HASH" 2>&1)
POSITIONS_ADDR=$(extract_addr "$POSITIONS_OUT")
echo "  -> EkuboPositions: $POSITIONS_ADDR"

# Deploy MockVesuPool
echo "  Deploying MockVesuPool..."
VESU_POOL_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$MOCK_VESU_HASH" \
    --constructor-calldata "$WBTC_ADDR" 2>&1)
VESU_POOL_ADDR=$(extract_addr "$VESU_POOL_OUT")
echo "  -> VesuPool: $VESU_POOL_ADDR"

echo ""
echo "[Step 3] Deploying BTCFiVault (with zero strategies/manager)..."

# Vault: constructor(asset, owner, ekubo_strategy, vesu_strategy, manager)
VAULT_DEPLOY_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$VAULT_HASH" \
    --constructor-calldata "$WBTC_ADDR" "$OWNER" "$ZERO_ADDR" "$ZERO_ADDR" "$ZERO_ADDR" 2>&1)
VAULT_ADDR=$(extract_addr "$VAULT_DEPLOY_OUT")
echo "  -> Vault: $VAULT_ADDR"

echo ""
echo "[Step 4] Deploying strategies (with real vault address)..."

# EkuboLPStrategy: constructor(vault, manager, owner, ekubo_positions, ekubo_core,
#                              token0, token1, pool_fee, pool_tick_spacing, pool_extension)
echo "  Deploying EkuboLPStrategy..."
EKUBO_STRAT_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$EKUBO_HASH" \
    --constructor-calldata "$VAULT_ADDR" "$ZERO_ADDR" "$OWNER" "$POSITIONS_ADDR" "$POSITIONS_ADDR" "$WBTC_ADDR" "$USDC_ADDR" "$POOL_FEE" "$POOL_TICK_SPACING" "$ZERO_ADDR" 2>&1)
EKUBO_STRAT_ADDR=$(extract_addr "$EKUBO_STRAT_OUT")
echo "  -> EkuboLPStrategy: $EKUBO_STRAT_ADDR"

# VesuLendingStrategy: constructor(vault, manager, owner, vesu_pool, pool_id, asset)
echo "  Deploying VesuLendingStrategy..."
VESU_STRAT_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$VESU_HASH" \
    --constructor-calldata "$VAULT_ADDR" "$ZERO_ADDR" "$OWNER" "$VESU_POOL_ADDR" "$POOL_ID" "$WBTC_ADDR" 2>&1)
VESU_STRAT_ADDR=$(extract_addr "$VESU_STRAT_OUT")
echo "  -> VesuLendingStrategy: $VESU_STRAT_ADDR"

echo ""
echo "[Step 5] Deploying BTCFiManager..."

# BTCFiManager: constructor(owner, vault, ekubo_strategy, vesu_strategy,
#               pragma_oracle, asset_token, keeper,
#               lower_price_bound(u256), upper_price_bound(u256))
# u256 is serialized as two felt252: (low, high)
LOWER_LO="400000000000"
LOWER_HI="0"
UPPER_LO="1000000000000"
UPPER_HI="0"

MANAGER_DEPLOY_OUT=$(sncast --account "$ACCOUNT" --network "$NETWORK" \
    deploy --class-hash "$MANAGER_HASH" \
    --constructor-calldata "$OWNER" "$VAULT_ADDR" "$EKUBO_STRAT_ADDR" "$VESU_STRAT_ADDR" "$ORACLE_ADDR" "$WBTC_ADDR" "$OWNER" "$LOWER_LO" "$LOWER_HI" "$UPPER_LO" "$UPPER_HI" 2>&1)
MANAGER_ADDR=$(extract_addr "$MANAGER_DEPLOY_OUT")
echo "  -> Manager: $MANAGER_ADDR"

echo ""
echo "[Step 6] Wiring contracts..."

# Wire vault: set_strategies(ekubo, vesu)
echo "  Setting vault strategies..."
sncast --account "$ACCOUNT" --network "$NETWORK" \
    invoke --contract-address "$VAULT_ADDR" \
    --function "set_strategies" \
    --calldata "$EKUBO_STRAT_ADDR" "$VESU_STRAT_ADDR" \
    --wait 2>&1
echo "  OK: Vault strategies set"

# Wire vault: set_manager_addr(manager)
echo "  Setting vault manager..."
sncast --account "$ACCOUNT" --network "$NETWORK" \
    invoke --contract-address "$VAULT_ADDR" \
    --function "set_manager_addr" \
    --calldata "$MANAGER_ADDR" \
    --wait 2>&1
echo "  OK: Vault manager set"

# Wire ekubo strategy: set_manager(manager)
echo "  Setting ekubo strategy manager..."
sncast --account "$ACCOUNT" --network "$NETWORK" \
    invoke --contract-address "$EKUBO_STRAT_ADDR" \
    --function "set_manager" \
    --calldata "$MANAGER_ADDR" \
    --wait 2>&1
echo "  OK: Ekubo strategy manager set"

# Wire vesu strategy: set_manager(manager)
echo "  Setting vesu strategy manager..."
sncast --account "$ACCOUNT" --network "$NETWORK" \
    invoke --contract-address "$VESU_STRAT_ADDR" \
    --function "set_manager" \
    --calldata "$MANAGER_ADDR" \
    --wait 2>&1
echo "  OK: Vesu strategy manager set"

echo ""
echo "==================================================="
echo " Deployment Complete!"
echo "==================================================="
echo ""
echo "Deployed Addresses:"
echo "  wBTC (MockERC20):       $WBTC_ADDR"
echo "  USDC (MockERC20):       $USDC_ADDR"
echo "  Oracle (MockPragma):    $ORACLE_ADDR"
echo "  Positions (MockEkubo):  $POSITIONS_ADDR"
echo "  VesuPool (Mock):        $VESU_POOL_ADDR"
echo "  BTCFiVault:             $VAULT_ADDR"
echo "  EkuboLPStrategy:        $EKUBO_STRAT_ADDR"
echo "  VesuLendingStrategy:    $VESU_STRAT_ADDR"
echo "  BTCFiManager:           $MANAGER_ADDR"
echo ""

# Save to file
cat > "$DEPLOY_LOG" << ADDRESSES
# BTCFi Vault - Sepolia Deployed Addresses
# Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')

OWNER=$OWNER
WBTC_ADDR=$WBTC_ADDR
USDC_ADDR=$USDC_ADDR
ORACLE_ADDR=$ORACLE_ADDR
POSITIONS_ADDR=$POSITIONS_ADDR
VESU_POOL_ADDR=$VESU_POOL_ADDR
VAULT_ADDR=$VAULT_ADDR
EKUBO_STRAT_ADDR=$EKUBO_STRAT_ADDR
VESU_STRAT_ADDR=$VESU_STRAT_ADDR
MANAGER_ADDR=$MANAGER_ADDR

# Voyager links:
# Vault:    https://sepolia.voyager.online/contract/$VAULT_ADDR
# Manager:  https://sepolia.voyager.online/contract/$MANAGER_ADDR
# Ekubo:    https://sepolia.voyager.online/contract/$EKUBO_STRAT_ADDR
# Vesu:     https://sepolia.voyager.online/contract/$VESU_STRAT_ADDR
ADDRESSES

echo "Addresses saved to $DEPLOY_LOG"
echo ""
echo "Next steps:"
echo "  1. Mint test wBTC:"
echo "     sncast invoke --contract-address $WBTC_ADDR --function mint_to --calldata '$OWNER 100000000 0' --network sepolia --account deployer"
echo "  2. Approve vault:"
echo "     sncast invoke --contract-address $WBTC_ADDR --function approve --calldata '$VAULT_ADDR 100000000 0' --network sepolia --account deployer"
echo "  3. Deposit to vault:"
echo "     sncast invoke --contract-address $VAULT_ADDR --function deposit --calldata '50000000 0 $OWNER' --network sepolia --account deployer"
