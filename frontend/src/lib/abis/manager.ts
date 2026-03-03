// Auto-extracted from btcfi_vault_BTCFiManager.contract_class.json
// Do not edit manually
export const MANAGER_ABI = [
  {
    "type": "impl",
    "name": "BTCFiManagerImpl",
    "interface_name": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::IBTCFiManager"
  },
  {
    "type": "enum",
    "name": "core::bool",
    "variants": [
      {
        "name": "False",
        "type": "()"
      },
      {
        "name": "True",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::integer::u256",
    "members": [
      {
        "name": "low",
        "type": "core::integer::u128"
      },
      {
        "name": "high",
        "type": "core::integer::u128"
      }
    ]
  },
  {
    "type": "enum",
    "name": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::VaultState",
    "variants": [
      {
        "name": "EkuboActive",
        "type": "()"
      },
      {
        "name": "VesuLending",
        "type": "()"
      },
      {
        "name": "Emergency",
        "type": "()"
      }
    ]
  },
  {
    "type": "interface",
    "name": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::IBTCFiManager",
    "items": [
      {
        "type": "function",
        "name": "check_rebalance",
        "inputs": [],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "rebalance",
        "inputs": [],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "emergency_escape",
        "inputs": [],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_price_bounds",
        "inputs": [
          {
            "name": "lower",
            "type": "core::integer::u256"
          },
          {
            "name": "upper",
            "type": "core::integer::u256"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_max_staleness",
        "inputs": [
          {
            "name": "max_staleness",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "set_keeper",
        "inputs": [
          {
            "name": "keeper",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "get_state",
        "inputs": [],
        "outputs": [
          {
            "type": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::VaultState"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "get_btc_price",
        "inputs": [],
        "outputs": [
          {
            "type": "core::integer::u256"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "get_price_bounds",
        "inputs": [],
        "outputs": [
          {
            "type": "(core::integer::u256, core::integer::u256)"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "OwnableMixinImpl",
    "interface_name": "openzeppelin_interfaces::access::ownable::OwnableABI"
  },
  {
    "type": "interface",
    "name": "openzeppelin_interfaces::access::ownable::OwnableABI",
    "items": [
      {
        "type": "function",
        "name": "owner",
        "inputs": [],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "transfer_ownership",
        "inputs": [
          {
            "name": "new_owner",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "renounce_ownership",
        "inputs": [],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "transferOwnership",
        "inputs": [
          {
            "name": "newOwner",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "renounceOwnership",
        "inputs": [],
        "outputs": [],
        "state_mutability": "external"
      }
    ]
  },
  {
    "type": "constructor",
    "name": "constructor",
    "inputs": [
      {
        "name": "owner",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "vault",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "ekubo_strategy",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "vesu_strategy",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "pragma_oracle",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "asset_token",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "keeper",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "lower_price_bound",
        "type": "core::integer::u256"
      },
      {
        "name": "upper_price_bound",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "event",
    "name": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
    "kind": "struct",
    "members": [
      {
        "name": "previous_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "new_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      }
    ]
  },
  {
    "type": "event",
    "name": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
    "kind": "struct",
    "members": [
      {
        "name": "previous_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "new_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      }
    ]
  },
  {
    "type": "event",
    "name": "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "OwnershipTransferred",
        "type": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
        "kind": "nested"
      },
      {
        "name": "OwnershipTransferStarted",
        "type": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::StateChanged",
    "kind": "struct",
    "members": [
      {
        "name": "from_state",
        "type": "core::felt252",
        "kind": "data"
      },
      {
        "name": "to_state",
        "type": "core::felt252",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::RebalanceExecuted",
    "kind": "struct",
    "members": [
      {
        "name": "btc_price",
        "type": "core::integer::u256",
        "kind": "data"
      },
      {
        "name": "new_state",
        "type": "core::felt252",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::PriceBoundsUpdated",
    "kind": "struct",
    "members": [
      {
        "name": "lower_price",
        "type": "core::integer::u256",
        "kind": "data"
      },
      {
        "name": "upper_price",
        "type": "core::integer::u256",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "OwnableEvent",
        "type": "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
        "kind": "flat"
      },
      {
        "name": "StateChanged",
        "type": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::StateChanged",
        "kind": "nested"
      },
      {
        "name": "RebalanceExecuted",
        "type": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::RebalanceExecuted",
        "kind": "nested"
      },
      {
        "name": "PriceBoundsUpdated",
        "type": "btcfi_vault::oracle::btcfi_manager::BTCFiManager::PriceBoundsUpdated",
        "kind": "nested"
      }
    ]
  }
] as const;
