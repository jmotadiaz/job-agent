/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for libraries that use native modules or have complex bundling requirements in the server
  serverExternalPackages: ['@react-pdf/renderer', 'better-sqlite3'],
};

export default nextConfig;
