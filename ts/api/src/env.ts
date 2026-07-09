import { z } from "zod";

const envSchema = z.object({
  STELLAR_TESTNET_RPC: z.string().url().default("https://soroban-testnet.stellar.org"),
  STELLAR_HORIZON_URL: z.string().url().default("https://horizon-testnet.stellar.org"),
  BASE_SEPOLIA_RPC: z.string().url().default("https://sepolia.base.org"),
  IRIS_SANDBOX_URL: z.string().url().default("https://iris-api-sandbox.circle.com"),

  NIET_SETTLER_ID: z.string().default("CC3F2ZF7SM6GT7EYWPXULBJWDHNHMYEL3VFJ3A5HRORJ7PHFKNBOWULE"),
  ORIGIN_SETTLER_ADDRESS: z.string().default("0xeb3d485296536d701230b45b900468385a8f9c4a"),
  BASE_SEPOLIA_CCTP_DOMAIN: z.coerce.number().default(6),
  STELLAR_CCTP_DOMAIN: z.coerce.number().default(27),
  USDC_BASE_SEPOLIA: z.string().default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
});

export type NietApiEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): NietApiEnv {
  return envSchema.parse(raw);
}
