/// BTCFi Manager — rebalance orchestrator
/// Supporting Domain: oracle reads, range detection, strategy switching
///
/// State machine: EkuboActive → VesuLending → EkuboActive (or Emergency)
/// "Escape" = BTC price exits LP tick range → pull liquidity → lend on Vesu
/// "Return" = BTC price re-enters range → withdraw from Vesu → re-enter LP
///
/// Fund flow:
///   Strategy.withdraw() → tokens land in vault
///   Manager reads vault's wBTC balance → transfers to dest strategy → calls deposit()

#[starknet::contract]
pub mod BTCFiManager {
    use openzeppelin::access::ownable::OwnableComponent;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};

    // Strategy interface
    use super::super::super::strategy::traits::{
        IStrategyDispatcher, IStrategyDispatcherTrait,
    };

    // Pragma oracle interface
    use super::super::super::interfaces::pragma::{
        IPragmaABIDispatcher, IPragmaABIDispatcherTrait, DataType, PragmaPricesResponse,
    };

    // Vault interface for transferring assets between strategies
    use super::super::super::interfaces::vault::{
        IBTCFiVaultDispatcher, IBTCFiVaultDispatcherTrait,
    };

    // ── Component wiring ──
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // ── Constants ──
    /// BTC/USD pair ID for Pragma oracle
    const BTC_USD_PAIR_ID: felt252 = 'BTC/USD';
    /// Maximum allowed price staleness (5 minutes)
    const DEFAULT_MAX_STALENESS: u64 = 300;

    // ── State Enum ──
    #[derive(Drop, Serde, Copy, starknet::Store, PartialEq)]
    pub enum VaultState {
        #[default]
        EkuboActive,
        VesuLending,
        Emergency,
    }

    // ── Events ──
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        StateChanged: StateChanged,
        RebalanceExecuted: RebalanceExecuted,
        PriceBoundsUpdated: PriceBoundsUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct StateChanged {
        pub from_state: felt252,
        pub to_state: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RebalanceExecuted {
        pub btc_price: u256,
        pub new_state: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PriceBoundsUpdated {
        pub lower_price: u256,
        pub upper_price: u256,
    }

    // ── Storage ──
    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        vault: ContractAddress,
        ekubo_strategy: ContractAddress,
        vesu_strategy: ContractAddress,
        pragma_oracle: ContractAddress,
        asset_token: ContractAddress,      // wBTC token address
        max_price_staleness: u64,
        // Price bounds that correspond to Ekubo LP tick range
        lower_price_bound: u256,   // Below this → escape to Vesu
        upper_price_bound: u256,   // Above this → escape to Vesu
        current_state: VaultState,
        last_rebalance_time: u64,
        // Keeper allowlist
        keeper: ContractAddress,
    }

    // ── Constructor ──
    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        vault: ContractAddress,
        ekubo_strategy: ContractAddress,
        vesu_strategy: ContractAddress,
        pragma_oracle: ContractAddress,
        asset_token: ContractAddress,
        keeper: ContractAddress,
        lower_price_bound: u256,
        upper_price_bound: u256,
    ) {
        self.ownable.initializer(owner);
        self.vault.write(vault);
        self.ekubo_strategy.write(ekubo_strategy);
        self.vesu_strategy.write(vesu_strategy);
        self.pragma_oracle.write(pragma_oracle);
        self.asset_token.write(asset_token);
        self.keeper.write(keeper);
        self.lower_price_bound.write(lower_price_bound);
        self.upper_price_bound.write(upper_price_bound);
        self.max_price_staleness.write(DEFAULT_MAX_STALENESS);
        self.current_state.write(VaultState::EkuboActive);
        self.last_rebalance_time.write(0);
    }

    // ── Manager Interface ──
    #[starknet::interface]
    pub trait IBTCFiManager<TContractState> {
        /// Check if rebalance is needed based on current BTC price.
        fn check_rebalance(self: @TContractState) -> bool;

        /// Execute rebalance: Escape or Return based on price.
        fn rebalance(ref self: TContractState);

        /// Emergency: force all assets to Vesu and set Emergency state.
        fn emergency_escape(ref self: TContractState);

        /// Owner: update price bounds for LP range.
        fn set_price_bounds(ref self: TContractState, lower: u256, upper: u256);

        /// Owner: update max price staleness.
        fn set_max_staleness(ref self: TContractState, max_staleness: u64);

        /// Owner: update keeper address.
        fn set_keeper(ref self: TContractState, keeper: ContractAddress);

        /// View: current vault state.
        fn get_state(self: @TContractState) -> VaultState;

        /// View: get current BTC price from Pragma.
        fn get_btc_price(self: @TContractState) -> u256;

        /// View: price bounds.
        fn get_price_bounds(self: @TContractState) -> (u256, u256);
    }

    #[abi(embed_v0)]
    impl BTCFiManagerImpl of IBTCFiManager<ContractState> {
        /// Returns true if price is out of LP range (need escape) or
        /// price returned to range (need return).
        fn check_rebalance(self: @ContractState) -> bool {
            let price = self._get_fresh_price();
            let lower = self.lower_price_bound.read();
            let upper = self.upper_price_bound.read();
            let state = self.current_state.read();

            match state {
                VaultState::EkuboActive => {
                    // Need escape if price is outside LP range
                    price < lower || price > upper
                },
                VaultState::VesuLending => {
                    // Need return if price is back within LP range
                    price >= lower && price <= upper
                },
                VaultState::Emergency => {
                    // No auto-rebalance from emergency
                    false
                },
            }
        }

        /// Execute rebalance based on current state and BTC price.
        fn rebalance(ref self: ContractState) {
            self._assert_keeper_or_owner();

            let price = self._get_fresh_price();
            let lower = self.lower_price_bound.read();
            let upper = self.upper_price_bound.read();
            let state = self.current_state.read();

            match state {
                VaultState::EkuboActive => {
                    // Escape: price exited LP range → move to Vesu
                    assert(price < lower || price > upper, 'PRICE_IN_RANGE');
                    self._escape_to_vesu();
                    self.current_state.write(VaultState::VesuLending);
                    self.emit(StateChanged { from_state: 'EkuboActive', to_state: 'VesuLending' });
                },
                VaultState::VesuLending => {
                    // Return: price re-entered LP range → move back to Ekubo
                    assert(price >= lower && price <= upper, 'PRICE_OUT_OF_RANGE');
                    self._return_to_ekubo();
                    self.current_state.write(VaultState::EkuboActive);
                    self.emit(StateChanged { from_state: 'VesuLending', to_state: 'EkuboActive' });
                },
                VaultState::Emergency => {
                    assert(false, 'IN_EMERGENCY');
                },
            }

            self.last_rebalance_time.write(get_block_timestamp());
            let state_felt = self._state_to_felt(self.current_state.read());
            self.emit(RebalanceExecuted { btc_price: price, new_state: state_felt });
        }

        fn emergency_escape(ref self: ContractState) {
            self.ownable.assert_only_owner();
            let state = self.current_state.read();

            // If in EkuboActive, escape first
            if state == VaultState::EkuboActive {
                self._escape_to_vesu();
            }

            self.current_state.write(VaultState::Emergency);
            self.emit(StateChanged { from_state: self._state_to_felt(state), to_state: 'Emergency' });
        }

        fn set_price_bounds(ref self: ContractState, lower: u256, upper: u256) {
            self.ownable.assert_only_owner();
            assert(lower < upper, 'INVALID_BOUNDS');
            self.lower_price_bound.write(lower);
            self.upper_price_bound.write(upper);
            self.emit(PriceBoundsUpdated { lower_price: lower, upper_price: upper });
        }

        fn set_max_staleness(ref self: ContractState, max_staleness: u64) {
            self.ownable.assert_only_owner();
            assert(max_staleness > 0, 'ZERO_STALENESS');
            self.max_price_staleness.write(max_staleness);
        }

        fn set_keeper(ref self: ContractState, keeper: ContractAddress) {
            self.ownable.assert_only_owner();
            self.keeper.write(keeper);
        }

        fn get_state(self: @ContractState) -> VaultState {
            self.current_state.read()
        }

        fn get_btc_price(self: @ContractState) -> u256 {
            self._get_fresh_price()
        }

        fn get_price_bounds(self: @ContractState) -> (u256, u256) {
            (self.lower_price_bound.read(), self.upper_price_bound.read())
        }
    }

    // ── Internal Helpers ──
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Query Pragma oracle for fresh BTC/USD price.
        fn _get_fresh_price(self: @ContractState) -> u256 {
            let oracle_disp = IPragmaABIDispatcher {
                contract_address: self.pragma_oracle.read(),
            };

            let response: PragmaPricesResponse = oracle_disp
                .get_data_median(DataType::SpotEntry(BTC_USD_PAIR_ID));

            // Validate freshness
            let now = get_block_timestamp();
            let max_staleness = self.max_price_staleness.read();
            assert(
                now - response.last_updated_timestamp <= max_staleness,
                'STALE_ORACLE_PRICE',
            );

            // Validate sources
            assert(response.num_sources_aggregated >= 3, 'INSUFFICIENT_SOURCES');

            // Return price as u256 (scaled by 10^decimals)
            response.price.into()
        }

        /// Escape: pull all assets from Ekubo → transfer wBTC to Vesu strategy → deposit.
        ///
        /// Flow:
        ///   1. Ekubo.withdraw(total) → tokens land in vault
        ///   2. Read vault's actual wBTC balance
        ///   3. Vault transfers wBTC to Vesu strategy (via vault.transfer_to_strategy)
        ///   4. Vesu.deposit(actual_balance) — strategy checks its own balance
        fn _escape_to_vesu(ref self: ContractState) {
            let ekubo_disp = IStrategyDispatcher {
                contract_address: self.ekubo_strategy.read(),
            };
            let vesu_strategy_addr = self.vesu_strategy.read();
            let vesu_disp = IStrategyDispatcher {
                contract_address: vesu_strategy_addr,
            };

            // Step 1: Get total assets in Ekubo
            let ekubo_assets = ekubo_disp.total_assets();
            if ekubo_assets == 0 {
                return;
            }

            // Step 2: Withdraw all from Ekubo (tokens go to vault)
            ekubo_disp.withdraw(ekubo_assets);

            // Step 3: Read vault's actual wBTC balance (may differ from ekubo_assets
            // because Ekubo returns mixed token0+token1, and only token0=wBTC goes to vault)
            let asset_addr = self.asset_token.read();
            let vault_addr = self.vault.read();
            let asset_disp = IERC20Dispatcher { contract_address: asset_addr };
            let actual_wbtc = asset_disp.balance_of(vault_addr);
            if actual_wbtc == 0 {
                return;
            }

            // Step 4: Transfer wBTC from vault to Vesu strategy
            let vault_disp = IBTCFiVaultDispatcher { contract_address: vault_addr };
            vault_disp.transfer_to_strategy(vesu_strategy_addr, actual_wbtc);

            // Step 5: Deposit into Vesu (strategy checks its own balance)
            vesu_disp.deposit(actual_wbtc);
        }

        /// Return: pull all assets from Vesu → transfer wBTC to Ekubo strategy → deposit.
        ///
        /// Flow:
        ///   1. Vesu.withdraw(total) → tokens land in vault
        ///   2. Read vault's actual wBTC balance
        ///   3. Vault transfers wBTC to Ekubo strategy
        ///   4. Ekubo.deposit(actual_balance) — strategy checks its own balance
        fn _return_to_ekubo(ref self: ContractState) {
            let ekubo_strategy_addr = self.ekubo_strategy.read();
            let ekubo_disp = IStrategyDispatcher {
                contract_address: ekubo_strategy_addr,
            };
            let vesu_disp = IStrategyDispatcher {
                contract_address: self.vesu_strategy.read(),
            };

            // Step 1: Get total assets in Vesu
            let vesu_assets = vesu_disp.total_assets();
            if vesu_assets == 0 {
                return;
            }

            // Step 2: Withdraw all from Vesu (tokens go to vault)
            vesu_disp.withdraw(vesu_assets);

            // Step 3: Read vault's actual wBTC balance
            let asset_addr = self.asset_token.read();
            let vault_addr = self.vault.read();
            let asset_disp = IERC20Dispatcher { contract_address: asset_addr };
            let actual_wbtc = asset_disp.balance_of(vault_addr);
            if actual_wbtc == 0 {
                return;
            }

            // Step 4: Transfer wBTC from vault to Ekubo strategy
            let vault_disp = IBTCFiVaultDispatcher { contract_address: vault_addr };
            vault_disp.transfer_to_strategy(ekubo_strategy_addr, actual_wbtc);

            // Step 5: Deposit into Ekubo (strategy checks its own balance)
            ekubo_disp.deposit(actual_wbtc);
        }

        fn _assert_keeper_or_owner(self: @ContractState) {
            let caller = get_caller_address();
            let owner = self.ownable.owner();
            let keeper = self.keeper.read();
            assert(caller == owner || caller == keeper, 'NOT_AUTHORIZED');
        }

        fn _state_to_felt(self: @ContractState, state: VaultState) -> felt252 {
            match state {
                VaultState::EkuboActive => 'EkuboActive',
                VaultState::VesuLending => 'VesuLending',
                VaultState::Emergency => 'Emergency',
            }
        }
    }
}
