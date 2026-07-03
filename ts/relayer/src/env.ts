import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REPO_ROOT = resolve(__dirname, "../../..");

const envSchema = z.object({
  BASE_SEPOLIA_PRIVATE_KEY: z.string().startsWith("0x"),
  STELLAR_TESTNET_SECRET: z.string().startsWith("S"),
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  STELLAR_TESTNET_RPC: z.string().url().default("https://soroban-testnet.stellar.org"),
  IRIS_SANDBOX_URL: z.string().url().default("https://iris-api-sandbox.circle.com"),
  STELLAR_NETWORK_PASSPHRASE: z.string().default("Test SDF Network ; September 2015"),
});

export type NietEnv = z.infer<typeof envSchema>;

/// Reads .env.local at the repo root and validates it.
export function loadEnv(): NietEnv {
  const envPath = resolve(REPO_ROOT, ".env.local");
  const text = readFileSync(envPath, "utf8");
  const raw: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m && m[1] && m[2]) raw[m[1]] = m[2];
  }
  return envSchema.parse(raw);
}
