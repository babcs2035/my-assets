import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  basePath: "/my-assets",
  experimental: {
    serverActions: {
      allowedOrigins: ["ktak.dev", "localhost:3000", "localhost:3400"],
    },
  },
};

export default nextConfig;
