#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Mint test wBTC on Starknet Sepolia
#
# Usage:
#   ./scripts/mint_test_wbtc.sh <RECIPIENT_ADDRESS> [AMOUNT_WBTC]
#
# Examples:
#   ./scripts/mint_test_wbtc.sh 0x1234...abcd        # Mint 1 wBTC (default)
#   ./scripts/mint_test_wbtc.sh 0x1234...abcd 5      # Mint 5 wBTC
#
# Prerequisites:
#   - sncast CLI installed (from starknet-foundry)
#   - Account "deployer" configured in snfoundry.toml
# ─────────────────────────────────────────────────────────

set -euo pipefail

# wBTC contract address on Sepolia (MockERC20 with public mint_to)
WBTC_ADDR="0x0177e83c0a28698daf5f65cfd4923d75513eb8175fa76d110bb92133afb2d627"

RECIPIENT="${1:?Usage: $0 <RECIPIENT_ADDRESS> [AMOUNT_WBTC]}"
AMOUNT_WBTC="${2:-1}"  # Default: 1 wBTC

# wBTC has 8 decimals → 1 wBTC = 100_000_000
AMOUNT_RAW=$(python3 -c "print(int(${AMOUNT_WBTC} * 10**8))")

echo "═══════════════════════════════════════════════════"
echo "  Minting ${AMOUNT_WBTC} wBTC to ${RECIPIENT}"
echo "  Raw amount: ${AMOUNT_RAW} (u256 low)"
echo "  Contract:   ${WBTC_ADDR}"
echo "═══════════════════════════════════════════════════"
echo ""

# mint_to(to: ContractAddress, amount: u256)
# u256 is passed as two felts: (low, high)
sncast invoke \
  --contract-address "$WBTC_ADDR" \
  --function mint_to \
  --calldata "$RECIPIENT $AMOUNT_RAW 0" \
  --network sepolia \
  --account deployer

echo ""
echo "Done! Check balance on Starkscan:"
echo "  https://sepolia.starkscan.co/contract/${WBTC_ADDR}#read-contract"
