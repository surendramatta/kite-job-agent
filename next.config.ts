import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "playwright", "pdf-parse", "mammoth", "imapflow", "mailparser"],
};

export default nextConfig;
