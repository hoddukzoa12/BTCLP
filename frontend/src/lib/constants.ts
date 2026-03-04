export const WBTC_DECIMALS = 8;
export const SHARE_DECIMALS = 8;
export const ORACLE_DECIMALS = 8;
export const BPS_BASE = 10000;

// 1 wBTC in smallest unit
export const ONE_WBTC = BigInt(10 ** WBTC_DECIMALS);
// 1 share in smallest unit
export const ONE_SHARE = BigInt(10 ** SHARE_DECIMALS);

export const POLLING_INTERVAL = 10_000; // 10 seconds

export const STARKSCAN_BASE = "https://sepolia.starkscan.co";
export const VOYAGER_BASE = "https://sepolia.voyager.online";

export const STATE_CONFIG = {
  0: {
    label: "EKUBO ACTIVE",
    description: "Earning LP Fees on Ekubo",
    color: "vault-green",
    bgClass: "bg-vault-green/10 border-vault-green/30",
    textClass: "text-vault-green",
    glowClass: "glow-green",
    icon: "TrendingUp" as const,
  },
  1: {
    label: "VESU LENDING",
    description: "Earning Interest on Vesu V2",
    color: "vault-blue",
    bgClass: "bg-vault-blue/10 border-vault-blue/30",
    textClass: "text-vault-blue",
    glowClass: "glow-blue",
    icon: "Landmark" as const,
  },
  2: {
    label: "EMERGENCY",
    description: "Assets Protected in Vault Buffer",
    color: "vault-red",
    bgClass: "bg-vault-red/10 border-vault-red/30",
    textClass: "text-vault-red",
    glowClass: "glow-red",
    icon: "AlertTriangle" as const,
  },
} as const;
