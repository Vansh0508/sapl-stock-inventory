import type { NextConfig } from "next";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns: any[] = [
  {
    protocol: "https",
    hostname: "www.shyamahuja.com",
    pathname: "/cdn/shop/**",
  },
  {
    protocol: "http",
    hostname: "localhost",
    port: "",
  },
  {
    protocol: "http",
    hostname: "127.0.0.1",
    port: "",
  },
  {
    protocol: "http",
    hostname: "localhost",
    port: "54321",
  },
  {
    protocol: "http",
    hostname: "127.0.0.1",
    port: "54321",
  },
];

if (supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    remotePatterns.push({
      protocol: parsed.protocol.replace(":", ""),
      hostname: parsed.hostname,
      port: parsed.port || "",
    });
  } catch (e) {
    console.error("Failed to parse NEXT_PUBLIC_SUPABASE_URL in config:", e);
  }
}

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns,
  },
  turbopack: {
    root: path.resolve(__dirname),
    resolveAlias: {
      "motion/react": "./node_modules/framer-motion",
    }
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "motion/react": path.resolve(__dirname, "node_modules/framer-motion"),
    };
    return config;
  }
};

export default nextConfig;
