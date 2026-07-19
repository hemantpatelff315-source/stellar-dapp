import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Freighter API touches the `window` object; keep transpilation predictable.
  transpilePackages: ["@stellar/freighter-api"],
};

export default nextConfig;
