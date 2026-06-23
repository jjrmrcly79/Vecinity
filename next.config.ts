import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para el Docker multi-stage (runner mínimo) en EasyPanel.
  output: "standalone",
};

export default nextConfig;
