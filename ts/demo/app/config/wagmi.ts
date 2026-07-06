import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";
import { http } from "wagmi";

import { NIET } from "./niet";

export const wagmiConfig = getDefaultConfig({
  appName: "Niet",
  projectId: NIET.WC_PROJECT_ID,
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http("https://sepolia.base.org"),
  },
  ssr: true,
});
