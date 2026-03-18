import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Prevent Next/Turbopack from inferring the wrong workspace root (we have
  // multiple lockfiles in parent directories).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
