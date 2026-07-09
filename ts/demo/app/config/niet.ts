export const NIET = {
  ORIGIN_SETTLER: "0xeb3d485296536d701230b45b900468385a8f9c4a" as `0x${string}`,
  USDC_BASE_SEPOLIA: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
  NIET_SETTLER_STELLAR: "CC3F2ZF7SM6GT7EYWPXULBJWDHNHMYEL3VFJ3A5HRORJ7PHFKNBOWULE",
  BLEND_POOL_STELLAR_TESTNET: "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF",
  DAY_0_HOLD_TARGET: "CCNCLHUN5OVPVGG3DHXD72TT4MAN2HN5QSQ7J6KPCTKOYVBDI3KI4UKQ",
  // API is served from the same origin under /api/*
  API_URL: process.env.NEXT_PUBLIC_NIET_API_URL ?? "",
  // WalletConnect projectId — grab a free one at https://cloud.walletconnect.com
  WC_PROJECT_ID: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo",
} as const;

export const CHAIN = {
  BASE_SEPOLIA_ID: 84532,
  BASESCAN_URL: "https://sepolia.basescan.org",
  STELLAR_EXPERT_URL: "https://stellar.expert/explorer/testnet",
} as const;
