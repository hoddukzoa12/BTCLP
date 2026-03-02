#!/usr/bin/env bash
set -euo pipefail

echo "BTCFi Vault - Sepolia Deployment Script"
echo "========================================"
echo "TODO: Implement deployment with sncast"
echo ""
echo "Deploy order:"
echo "  1. scarb build"
echo "  2. sncast declare MockPragmaOracle"
echo "  3. sncast declare MockERC20 (if needed)"
echo "  4. sncast declare EkuboLPStrategy"
echo "  5. sncast declare VesuLendingStrategy"
echo "  6. sncast declare BTCFiVault"
echo "  7. sncast declare BTCFiManager"
echo "  8. sncast deploy each contract"
echo "  9. Configure contract relationships (set_manager, etc.)"
