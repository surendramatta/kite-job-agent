import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "better-sqlite3",
    "playwright",
    "pdf-parse",
    "mammoth",
    "imapflow",
    "mailparser",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
  "localhost:3000",
  "*.app.github.dev",
  "legendary-xylophone-756g6jx4xrwhpw5w-3000.app.github.dev",
],
    },
  },
};

export default nextConfig;