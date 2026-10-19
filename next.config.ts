import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cadbqpuiitjfnhyzhhnz.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Campaign image uploads go through a server action (≤ 3 MB file + form overhead).
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
