import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Only set outputFileTracingRoot for local development. Vercel's build
// environment handles this via its own detection.
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { outputFileTracingRoot: resolve(__dirname, "../..") }),
};

export default nextConfig;
