import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for libraries that use native modules or have complex bundling requirements in the server
  serverExternalPackages: ["@react-pdf/renderer", "better-sqlite3"],
  // Prevent Next.js from inferring a wrong workspace root when multiple lockfiles exist
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
