/// BTCFi Strategy Vault — ERC-4626 compliant vault
/// Core Domain: user deposits, share accounting, asset custody
///
/// Uses OpenZeppelin ERC20Component for share token.
/// Delegates capital to EkuboLP and VesuLending strategies.

#[starknet::contract]
pub mod BTCFiVault {
    use openzeppelin::token::erc20::{DefaultConfig, ERC20Component, ERC20HooksEmptyImpl};
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    // Strategy interface for cross-contract calls (total_assets, withdraw)
    use super::super::super::strategy::traits::{
        IStrategyDispatcher, IStrategyDispatcherTrait,
    };

    // ── Component wiring ──
    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    // ERC20 (share token)
    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    // Ownable
    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // ── Events ──
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        Deposit: Deposit,
        Withdraw: Withdraw,
        AllocationChanged: AllocationChanged,
        Paused: Paused,
        Unpaused: Unpaused,
        EmergencyWithdraw: EmergencyWithdraw,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Deposit {
        #[key]
        pub sender: ContractAddress,
        #[key]
        pub owner: ContractAddress,
        pub assets: u256,
        pub shares: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Withdraw {
        #[key]
        pub sender: ContractAddress,
        #[key]
        pub receiver: ContractAddress,
        #[key]
        pub owner: ContractAddress,
        pub assets: u256,
        pub shares: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AllocationChanged {
        pub ekubo_bps: u16,
        pub vesu_bps: u16,
        pub buffer_bps: u16,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Paused {}

    #[derive(Drop, starknet::Event)]
    pub struct Unpaused {}

    #[derive(Drop, starknet::Event)]
    pub struct EmergencyWithdraw {}

    // ── Constants ──
    const BPS_DENOMINATOR: u16 = 10000;
    const MAX_U256: u256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    // ── Storage ──
    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        asset_token: ContractAddress,
        ekubo_strategy_addr: ContractAddress,
        vesu_strategy_addr: ContractAddress,
        manager_addr: ContractAddress,
        ekubo_allocation_bps: u16,
        vesu_allocation_bps: u16,
        paused: bool,
    }

    // ── Constructor ──
    #[constructor]
    fn constructor(
        ref self: ContractState,
        asset: ContractAddress,
        owner: ContractAddress,
        ekubo_strategy: ContractAddress,
        vesu_strategy: ContractAddress,
        manager: ContractAddress,
    ) {
        // Initialize share token (ERC20)
        self.erc20.initializer("BTCFi Vault Share", "bfVault");

        // Initialize ownership
        self.ownable.initializer(owner);

        // Store vault config
        self.asset_token.write(asset);
        self.ekubo_strategy_addr.write(ekubo_strategy);
        self.vesu_strategy_addr.write(vesu_strategy);
        self.manager_addr.write(manager);

        // Default allocation: 50% Ekubo, 40% Vesu, 10% buffer
        self.ekubo_allocation_bps.write(5000);
        self.vesu_allocation_bps.write(4000);
        self.paused.write(false);
    }

    // ── IBTCFiVault Implementation ──
    #[abi(embed_v0)]
    impl BTCFiVaultImpl of super::super::super::interfaces::vault::IBTCFiVault<ContractState> {
        // ────────────────────────────────────
        //  ERC-4626 Core
        // ────────────────────────────────────

        /// Deposit underlying assets and mint vault shares.
        fn deposit(ref self: ContractState, assets: u256, receiver: ContractAddress) -> u256 {
            self._assert_not_paused();
            assert(assets > 0, 'ZERO_ASSETS');

            let shares = self._convert_to_shares(assets);
            assert(shares > 0, 'ZERO_SHARES');

            let caller = get_caller_address();

            // Transfer wBTC from caller to vault
            let asset_dispatcher = IERC20Dispatcher {
                contract_address: self.asset_token.read(),
            };
            let success = asset_dispatcher.transfer_from(caller, get_contract_address(), assets);
            assert(success, 'TRANSFER_FROM_FAILED');

            // Mint shares to receiver
            self.erc20.mint(receiver, shares);

            self.emit(Deposit { sender: caller, owner: receiver, assets, shares });

            shares
        }

        /// Mint exact shares amount, pulling proportional assets from caller.
        /// ERC-4626: round UP assets to pull (in favor of vault).
        fn mint(ref self: ContractState, shares: u256, receiver: ContractAddress) -> u256 {
            self._assert_not_paused();
            assert(shares > 0, 'ZERO_SHARES');

            let assets = self._convert_to_assets_round_up(shares);
            assert(assets > 0, 'ZERO_ASSETS');

            let caller = get_caller_address();

            // Transfer wBTC from caller to vault (round up = vault-favorable)
            let asset_dispatcher = IERC20Dispatcher {
                contract_address: self.asset_token.read(),
            };
            let success = asset_dispatcher.transfer_from(caller, get_contract_address(), assets);
            assert(success, 'TRANSFER_FROM_FAILED');

            // Mint shares to receiver
            self.erc20.mint(receiver, shares);

            self.emit(Deposit { sender: caller, owner: receiver, assets, shares });

            assets
        }

        /// Withdraw exact assets amount, burning proportional shares.
        /// ERC-4626: round UP shares to burn (in favor of vault).
        fn withdraw(
            ref self: ContractState,
            assets: u256,
            receiver: ContractAddress,
            owner: ContractAddress,
        ) -> u256 {
            self._assert_not_paused();
            assert(assets > 0, 'ZERO_ASSETS');

            // Ensure vault has enough liquid assets FIRST.
            // This may trigger strategy withdrawals (Ekubo can realize IL),
            // which changes total_assets and therefore the share price.
            self._ensure_liquidity(assets);

            // Compute shares AFTER liquidity pull so the share price
            // reflects any IL realized during strategy unwind.
            let shares = self._convert_to_shares_round_up(assets);
            assert(shares > 0, 'ZERO_SHARES');

            let caller = get_caller_address();

            // Check and spend allowance if caller != owner
            if caller != owner {
                self.erc20._spend_allowance(owner, caller, shares);
            }

            // Burn shares from owner
            self.erc20.burn(owner, shares);

            // Transfer wBTC to receiver
            let asset_dispatcher = IERC20Dispatcher {
                contract_address: self.asset_token.read(),
            };
            let success = asset_dispatcher.transfer(receiver, assets);
            assert(success, 'TRANSFER_FAILED');

            self.emit(Withdraw { sender: caller, receiver, owner, assets, shares });

            shares
        }

        /// Redeem exact shares amount, returning proportional assets.
        /// Does NOT revert when assets rounds to zero — burns dust shares gracefully.
        fn redeem(
            ref self: ContractState,
            shares: u256,
            receiver: ContractAddress,
            owner: ContractAddress,
        ) -> u256 {
            self._assert_not_paused();
            assert(shares > 0, 'ZERO_SHARES');

            // Preview assets before any strategy unwind
            let preview_assets = self._convert_to_assets(shares);

            // Pull liquidity FIRST so any IL from Ekubo unwind is realized
            if preview_assets > 0 {
                self._ensure_liquidity(preview_assets);
            }

            // Recompute assets AFTER liquidity pull to reflect realized IL
            let assets = self._convert_to_assets(shares);

            let caller = get_caller_address();

            if caller != owner {
                self.erc20._spend_allowance(owner, caller, shares);
            }

            // Burn shares from owner (even if assets == 0, dust shares are cleaned up)
            self.erc20.burn(owner, shares);

            // Only transfer if there are assets to send
            if assets > 0 {
                let asset_dispatcher = IERC20Dispatcher {
                    contract_address: self.asset_token.read(),
                };
                let success = asset_dispatcher.transfer(receiver, assets);
                assert(success, 'TRANSFER_FAILED');
            }

            self.emit(Withdraw { sender: caller, receiver, owner, assets, shares });

            assets
        }

        // ────────────────────────────────────
        //  ERC-4626 View
        // ────────────────────────────────────

        fn asset(self: @ContractState) -> ContractAddress {
            self.asset_token.read()
        }

        /// Total assets = buffer (vault balance) + ekubo strategy + vesu strategy.
        /// This is the canonical AUM used for ERC-4626 share pricing.
        fn total_assets(self: @ContractState) -> u256 {
            self._total_assets_internal()
        }

        fn convert_to_shares(self: @ContractState, assets: u256) -> u256 {
            self._convert_to_shares(assets)
        }

        fn convert_to_assets(self: @ContractState, shares: u256) -> u256 {
            self._convert_to_assets(shares)
        }

        fn max_deposit(self: @ContractState, receiver: ContractAddress) -> u256 {
            if self.paused.read() {
                0
            } else {
                MAX_U256
            }
        }

        fn max_mint(self: @ContractState, receiver: ContractAddress) -> u256 {
            if self.paused.read() {
                0
            } else {
                MAX_U256
            }
        }

        fn max_withdraw(self: @ContractState, owner: ContractAddress) -> u256 {
            if self.paused.read() {
                0
            } else {
                self._convert_to_assets(self.erc20.balance_of(owner))
            }
        }

        fn max_redeem(self: @ContractState, owner: ContractAddress) -> u256 {
            if self.paused.read() {
                0
            } else {
                self.erc20.balance_of(owner)
            }
        }

        fn preview_deposit(self: @ContractState, assets: u256) -> u256 {
            self._convert_to_shares(assets)
        }

        fn preview_mint(self: @ContractState, shares: u256) -> u256 {
            self._convert_to_assets_round_up(shares)
        }

        fn preview_withdraw(self: @ContractState, assets: u256) -> u256 {
            self._convert_to_shares_round_up(assets)
        }

        fn preview_redeem(self: @ContractState, shares: u256) -> u256 {
            self._convert_to_assets(shares)
        }

        // ────────────────────────────────────
        //  Management (Owner / Manager)
        // ────────────────────────────────────

        fn set_allocation(ref self: ContractState, ekubo_bps: u16, vesu_bps: u16) {
            self._assert_owner_or_manager();
            assert(ekubo_bps + vesu_bps <= BPS_DENOMINATOR, 'ALLOC_EXCEEDS_100');

            self.ekubo_allocation_bps.write(ekubo_bps);
            self.vesu_allocation_bps.write(vesu_bps);

            let buffer_bps = BPS_DENOMINATOR - ekubo_bps - vesu_bps;
            self.emit(AllocationChanged { ekubo_bps, vesu_bps, buffer_bps });
        }

        fn pause(ref self: ContractState) {
            self.ownable.assert_only_owner();
            self.paused.write(true);
            self.emit(Paused {});
        }

        fn unpause(ref self: ContractState) {
            self.ownable.assert_only_owner();
            self.paused.write(false);
            self.emit(Unpaused {});
        }

        fn emergency_withdraw(ref self: ContractState) {
            self._assert_owner_or_manager();

            let zero: ContractAddress = 0.try_into().unwrap();

            // Pull all assets from Vesu back to vault buffer
            let vesu_addr = self.vesu_strategy_addr.read();
            if vesu_addr != zero {
                let vesu_disp = IStrategyDispatcher { contract_address: vesu_addr };
                let vesu_assets = vesu_disp.total_assets();
                if vesu_assets > 0 {
                    vesu_disp.withdraw(vesu_assets);
                }
            }

            // Pull all assets from Ekubo back to vault buffer
            let ekubo_addr = self.ekubo_strategy_addr.read();
            if ekubo_addr != zero {
                let ekubo_disp = IStrategyDispatcher { contract_address: ekubo_addr };
                let ekubo_assets = ekubo_disp.total_assets();
                if ekubo_assets > 0 {
                    ekubo_disp.withdraw(ekubo_assets);
                }
            }

            self.paused.write(true);
            self.emit(EmergencyWithdraw {});
        }

        /// Transfer wBTC from vault to a strategy during rebalance.
        /// Only callable by manager or owner. Used by BTCFiManager to move
        /// assets from vault to destination strategy before calling strategy.deposit().
        fn transfer_to_strategy(
            ref self: ContractState, strategy: ContractAddress, amount: u256,
        ) {
            self._assert_owner_or_manager();
            assert(amount > 0, 'ZERO_AMOUNT');

            // Validate strategy is one of our registered strategies
            let ekubo = self.ekubo_strategy_addr.read();
            let vesu = self.vesu_strategy_addr.read();
            assert(strategy == ekubo || strategy == vesu, 'INVALID_STRATEGY');

            let asset_dispatcher = IERC20Dispatcher {
                contract_address: self.asset_token.read(),
            };
            let success = asset_dispatcher.transfer(strategy, amount);
            assert(success, 'TRANSFER_FAILED');
        }

        // ────────────────────────────────────
        //  View
        // ────────────────────────────────────

        fn ekubo_allocation_bps(self: @ContractState) -> u16 {
            self.ekubo_allocation_bps.read()
        }

        fn vesu_allocation_bps(self: @ContractState) -> u16 {
            self.vesu_allocation_bps.read()
        }

        fn buffer_bps(self: @ContractState) -> u16 {
            BPS_DENOMINATOR - self.ekubo_allocation_bps.read() - self.vesu_allocation_bps.read()
        }

        fn is_paused(self: @ContractState) -> bool {
            self.paused.read()
        }

        fn ekubo_strategy(self: @ContractState) -> ContractAddress {
            self.ekubo_strategy_addr.read()
        }

        fn vesu_strategy(self: @ContractState) -> ContractAddress {
            self.vesu_strategy_addr.read()
        }

        fn manager(self: @ContractState) -> ContractAddress {
            self.manager_addr.read()
        }
    }

    // ── Internal Helpers ──
    //
    // Virtual offset (+1) is applied to both supply and total_assets in all
    // conversion math.  This follows the OZ ERC-4626 pattern and makes the
    // classic donation / inflation attack economically infeasible: an attacker
    // who donates `d` tokens only captures `d / (d + 1)` of the next deposit's
    // value, which is always less than `d` — a net loss for the attacker.

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Convert assets → shares, rounding DOWN (used by deposit — vault-favorable)
        /// Uses virtual offset: shares = assets * (supply + 1) / (total + 1)
        fn _convert_to_shares(self: @ContractState, assets: u256) -> u256 {
            let supply = self.erc20.total_supply();
            let total = self._total_assets_internal();
            // Virtual offset: +1 to both numerator and denominator
            // When supply == 0: (assets * 1) / (0 + 1) = assets  (1:1)
            (assets * (supply + 1)) / (total + 1)
        }

        /// Convert assets → shares, rounding UP (used by withdraw — vault-favorable)
        /// ceil(a * b / c) = (a * b + c - 1) / c, with virtual offset
        fn _convert_to_shares_round_up(self: @ContractState, assets: u256) -> u256 {
            let supply = self.erc20.total_supply();
            let total = self._total_assets_internal();
            let denominator = total + 1;
            (assets * (supply + 1) + denominator - 1) / denominator
        }

        /// Convert shares → assets, rounding DOWN (used by redeem — vault-favorable)
        /// Uses virtual offset: assets = shares * (total + 1) / (supply + 1)
        fn _convert_to_assets(self: @ContractState, shares: u256) -> u256 {
            let supply = self.erc20.total_supply();
            let total = self._total_assets_internal();
            (shares * (total + 1)) / (supply + 1)
        }

        /// Convert shares → assets, rounding UP (used by mint — vault-favorable)
        /// ceil(a * b / c) = (a * b + c - 1) / c, with virtual offset
        fn _convert_to_assets_round_up(self: @ContractState, shares: u256) -> u256 {
            let supply = self.erc20.total_supply();
            let total = self._total_assets_internal();
            let denominator = supply + 1;
            (shares * (total + 1) + denominator - 1) / denominator
        }

        /// Internal total_assets = buffer + ekubo + vesu strategy balances.
        /// Used by all ERC-4626 conversion math for accurate share pricing.
        fn _total_assets_internal(self: @ContractState) -> u256 {
            let buffer = self._buffer_balance();

            let ekubo_addr = self.ekubo_strategy_addr.read();
            let vesu_addr = self.vesu_strategy_addr.read();

            let zero: ContractAddress = 0.try_into().unwrap();

            let ekubo_assets = if ekubo_addr != zero {
                IStrategyDispatcher { contract_address: ekubo_addr }.total_assets()
            } else {
                0
            };

            let vesu_assets = if vesu_addr != zero {
                IStrategyDispatcher { contract_address: vesu_addr }.total_assets()
            } else {
                0
            };

            buffer + ekubo_assets + vesu_assets
        }

        /// Get vault's wBTC balance (liquid buffer)
        fn _buffer_balance(self: @ContractState) -> u256 {
            let asset_addr = self.asset_token.read();
            let vault_addr = get_contract_address();
            let asset_dispatcher = IERC20Dispatcher { contract_address: asset_addr };
            asset_dispatcher.balance_of(vault_addr)
        }

        /// Ensure vault has enough liquid wBTC for withdrawal.
        /// If buffer is insufficient, pull from strategies.
        /// Priority 1: Vesu (instant redemption, no IL)
        /// Priority 2: Ekubo (may have impermanent loss)
        fn _ensure_liquidity(ref self: ContractState, needed: u256) {
            let mut buffer = self._buffer_balance();
            if buffer >= needed {
                return;
            }

            let shortfall = needed - buffer;
            let zero: ContractAddress = 0.try_into().unwrap();

            // Priority 1: Pull from Vesu (instant, no IL)
            let vesu_addr = self.vesu_strategy_addr.read();
            if vesu_addr != zero {
                let vesu_disp = IStrategyDispatcher { contract_address: vesu_addr };
                let vesu_available = vesu_disp.total_assets();
                if vesu_available > 0 {
                    let pull_amount = if shortfall <= vesu_available {
                        shortfall
                    } else {
                        vesu_available
                    };
                    vesu_disp.withdraw(pull_amount);
                    buffer = self._buffer_balance();
                    if buffer >= needed {
                        return;
                    }
                }
            }

            // Priority 2: Pull from Ekubo (may have IL)
            let ekubo_addr = self.ekubo_strategy_addr.read();
            if ekubo_addr != zero {
                let ekubo_disp = IStrategyDispatcher { contract_address: ekubo_addr };
                let ekubo_available = ekubo_disp.total_assets();
                if ekubo_available > 0 {
                    let remaining = needed - buffer;
                    let pull_amount = if remaining <= ekubo_available {
                        remaining
                    } else {
                        ekubo_available
                    };
                    ekubo_disp.withdraw(pull_amount);
                    buffer = self._buffer_balance();
                }
            }

            assert(buffer >= needed, 'INSUFFICIENT_LIQUIDITY');
        }

        fn _assert_not_paused(self: @ContractState) {
            assert(!self.paused.read(), 'VAULT_PAUSED');
        }

        fn _assert_owner_or_manager(self: @ContractState) {
            let caller = get_caller_address();
            let owner = self.ownable.owner();
            let mgr = self.manager_addr.read();
            assert(caller == owner || caller == mgr, 'NOT_AUTHORIZED');
        }
    }
}
