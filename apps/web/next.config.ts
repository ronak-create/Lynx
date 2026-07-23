import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (server.js + a minimal node_modules) so the Docker
  // runtime image ships without the full dependency tree. Consumed by apps/web/Dockerfile.
  output: "standalone",
};

export default nextConfig;
