import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for development checks (helps catch bugs early)
  reactStrictMode: true,

  // Log configuration
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;
