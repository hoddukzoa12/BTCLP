/// Mock ERC-20 — mintable test token (wBTC, USDC)
/// Generic Subdomain: for unit tests and Sepolia demo
///
/// Implements IERC20 via OZ ERC20Component + a public mint_to for testing.
#[starknet::contract]
pub mod MockERC20 {
    use openzeppelin::token::erc20::{DefaultConfig, ERC20Component, ERC20HooksEmptyImpl};
    use starknet::ContractAddress;

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
    }

    #[constructor]
    fn constructor(ref self: ContractState, name: ByteArray, symbol: ByteArray) {
        self.erc20.initializer(name, symbol);
    }

    /// Public mint — anyone can call during testing.
    #[external(v0)]
    fn mint_to(ref self: ContractState, to: ContractAddress, amount: u256) {
        self.erc20.mint(to, amount);
    }
}
