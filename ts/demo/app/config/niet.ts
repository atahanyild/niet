export const NIET = {
  ORIGIN_SETTLER: "0x747e90a4e6c5eb39a8e138a3d98794ea3be12e55" as `0x${string}`,
  USDC_BASE_SEPOLIA: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
  NIET_SETTLER_STELLAR: "CAVJPLSNRHZ35GYCQLNGFDUCMGIYHFHI7SOUBBR2ZL7WCWPOQGDW6AX4",
  BLEND_POOL_STELLAR_TESTNET: "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF",
  DAY_0_HOLD_TARGET: "CCNCLHUN5OVPVGG3DHXD72TT4MAN2HN5QSQ7J6KPCTKOYVBDI3KI4UKQ",
  // Public REST API (fallback: local dev)
  API_URL: process.env.NEXT_PUBLIC_NIET_API_URL ?? "http://localhost:8787",
  // WalletConnect projectId — grab a free one at https://cloud.walletconnect.com
  WC_PROJECT_ID: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo",
} as const;

export const CHAIN = {
  BASE_SEPOLIA_ID: 84532,
  BASESCAN_URL: "https://sepolia.basescan.org",
  STELLAR_EXPERT_URL: "https://stellar.expert/explorer/testnet",
} as const;
