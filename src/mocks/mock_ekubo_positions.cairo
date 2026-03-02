/// Mock Ekubo Positions — simulates IEkuboPositions for unit testing.
/// Tracks a single NFT position with configurable token amounts.
/// Does NOT actually perform swaps — just moves ERC-20 balances.
#[starknet::contract]
pub mod MockEkuboPositions {
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::super::super::interfaces::ekubo::{
        PoolKey, Bounds, PoolPrice, GetTokenInfoResult, GetTokenInfoRequest, i129,
    };

    #[storage]
    struct Storage {
        next_nft_id: u64,
        // Per-NFT state (simplified: one active NFT)
        nft_liquidity: u128,
        nft_amount0: u128,
        nft_amount1: u128,
        nft_fees0: u128,
        nft_fees1: u128,
        // Pool key tokens (set on first mint)
        token0: ContractAddress,
        token1: ContractAddress,
        // Who owns the NFT (the strategy contract)
        nft_owner: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_nft_id.write(1);
    }

    // ── IEkuboPositions implementation ──
    #[abi(embed_v0)]
    impl PositionsImpl of super::super::super::interfaces::ekubo::IEkuboPositions<ContractState> {
        fn mint_and_deposit(
            ref self: ContractState, pool_key: PoolKey, bounds: Bounds, min_liquidity: u128,
        ) -> (u64, u128) {
            let caller = get_caller_address();
            self.token0.write(pool_key.token0);
            self.token1.write(pool_key.token1);
            self.nft_owner.write(caller);

            // Pull token0 from caller (strategy approved us)
            let token0_disp = IERC20Dispatcher { contract_address: pool_key.token0 };
            let bal0 = token0_disp.balance_of(caller);
            if bal0 > 0 {
                token0_disp.transfer_from(caller, get_contract_address(), bal0);
            }
            // Pull token1 from caller
            let token1_disp = IERC20Dispatcher { contract_address: pool_key.token1 };
            let bal1 = token1_disp.balance_of(caller);
            if bal1 > 0 {
                token1_disp.transfer_from(caller, get_contract_address(), bal1);
            }

            let liquidity: u128 = bal0.try_into().unwrap();
            let nft_id = self.next_nft_id.read();
            self.next_nft_id.write(nft_id + 1);
            self.nft_liquidity.write(liquidity);
            self.nft_amount0.write(bal0.try_into().unwrap());
            self.nft_amount1.write(bal1.try_into().unwrap());

            (nft_id, liquidity)
        }

        fn withdraw(
            ref self: ContractState,
            id: u64,
            pool_key: PoolKey,
            bounds: Bounds,
            liquidity: u128,
            min_token0: u128,
            min_token1: u128,
            collect_fees: bool,
        ) -> (u128, u128) {
            let owner = self.nft_owner.read();
            let total_liq = self.nft_liquidity.read();
            assert(total_liq > 0, 'EMPTY_POSITION');

            // Proportional withdrawal
            let amt0: u128 = self.nft_amount0.read();
            let amt1: u128 = self.nft_amount1.read();

            let out0: u128 = if liquidity >= total_liq {
                amt0
            } else {
                let a0_256: u256 = amt0.into();
                let l256: u256 = liquidity.into();
                let tl256: u256 = total_liq.into();
                ((a0_256 * l256) / tl256).try_into().unwrap()
            };
            let out1: u128 = if liquidity >= total_liq {
                amt1
            } else {
                let a1_256: u256 = amt1.into();
                let l256: u256 = liquidity.into();
                let tl256: u256 = total_liq.into();
                ((a1_256 * l256) / tl256).try_into().unwrap()
            };

            // Update state
            if liquidity >= total_liq {
                self.nft_liquidity.write(0);
                self.nft_amount0.write(0);
                self.nft_amount1.write(0);
            } else {
                self.nft_liquidity.write(total_liq - liquidity);
                self.nft_amount0.write(amt0 - out0);
                self.nft_amount1.write(amt1 - out1);
            }

            // Transfer tokens to NFT owner (the strategy)
            if out0 > 0 {
                let token0_disp = IERC20Dispatcher { contract_address: self.token0.read() };
                token0_disp.transfer(owner, out0.into());
            }
            if out1 > 0 {
                let token1_disp = IERC20Dispatcher { contract_address: self.token1.read() };
                token1_disp.transfer(owner, out1.into());
            }

            // Collect fees if requested
            let mut fees0: u128 = 0;
            let mut fees1: u128 = 0;
            if collect_fees {
                fees0 = self.nft_fees0.read();
                fees1 = self.nft_fees1.read();
                self.nft_fees0.write(0);
                self.nft_fees1.write(0);
                if fees0 > 0 {
                    let token0_disp = IERC20Dispatcher { contract_address: self.token0.read() };
                    token0_disp.transfer(owner, fees0.into());
                }
                if fees1 > 0 {
                    let token1_disp = IERC20Dispatcher { contract_address: self.token1.read() };
                    token1_disp.transfer(owner, fees1.into());
                }
            }

            (out0 + fees0, out1 + fees1)
        }

        fn collect_fees(
            ref self: ContractState, id: u64, pool_key: PoolKey, bounds: Bounds,
        ) -> (u128, u128) {
            let owner = self.nft_owner.read();
            let fees0 = self.nft_fees0.read();
            let fees1 = self.nft_fees1.read();
            self.nft_fees0.write(0);
            self.nft_fees1.write(0);

            if fees0 > 0 {
                let token0_disp = IERC20Dispatcher { contract_address: self.token0.read() };
                token0_disp.transfer(owner, fees0.into());
            }
            if fees1 > 0 {
                let token1_disp = IERC20Dispatcher { contract_address: self.token1.read() };
                token1_disp.transfer(owner, fees1.into());
            }

            (fees0, fees1)
        }

        fn get_token_info(
            self: @ContractState, id: u64, pool_key: PoolKey, bounds: Bounds,
        ) -> GetTokenInfoResult {
            GetTokenInfoResult {
                pool_price: PoolPrice {
                    sqrt_ratio: 0,
                    tick: i129 { mag: 0, sign: false },
                },
                liquidity: self.nft_liquidity.read(),
                amount0: self.nft_amount0.read(),
                amount1: self.nft_amount1.read(),
                fees0: self.nft_fees0.read(),
                fees1: self.nft_fees1.read(),
            }
        }

        fn get_tokens_info(
            self: @ContractState, params: Span<GetTokenInfoRequest>,
        ) -> Span<GetTokenInfoResult> {
            array![].span()
        }

        fn get_pool_price(self: @ContractState, pool_key: PoolKey) -> PoolPrice {
            PoolPrice {
                sqrt_ratio: 0,
                tick: i129 { mag: 0, sign: false },
            }
        }

        fn deposit(
            ref self: ContractState, id: u64, pool_key: PoolKey, bounds: Bounds, min_liquidity: u128,
        ) -> u128 {
            let caller = get_caller_address();
            // Pull token0 from caller
            let token0_disp = IERC20Dispatcher { contract_address: self.token0.read() };
            let bal0 = token0_disp.balance_of(caller);
            if bal0 > 0 {
                token0_disp.transfer_from(caller, get_contract_address(), bal0);
            }

            let added_liq: u128 = bal0.try_into().unwrap();
            let cur_liq = self.nft_liquidity.read();
            let cur_amt0 = self.nft_amount0.read();
            self.nft_liquidity.write(cur_liq + added_liq);
            self.nft_amount0.write(cur_amt0 + added_liq);

            added_liq
        }
    }

    // ── Test helpers ──

    /// Simulate fees accruing (call from test)
    #[external(v0)]
    fn set_fees(ref self: ContractState, fees0: u128, fees1: u128) {
        self.nft_fees0.write(fees0);
        self.nft_fees1.write(fees1);
    }

    /// Simulate token1-only position (price moved above range)
    #[external(v0)]
    fn set_token1_only(ref self: ContractState, amount1: u128) {
        self.nft_amount0.write(0);
        self.nft_amount1.write(amount1);
        // Keep liquidity unchanged
    }
}
