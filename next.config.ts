import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Cloudflare Pages
  output: "export",
  trailingSlash: true,
  // Disable image optimization (not needed for static export)
  images: {
    unoptimized: true,
  },
  // Allow loading JSON data at build time
  experimental: {},
};

export default nextConfig;
