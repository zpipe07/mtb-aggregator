import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy /api to Go backend in dev; in prod, set API_URL and use rewrites if needed
  async rewrites() {
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl && apiUrl !== "/api") {
      return [
        {
          source: "/api/:path*",
          destination: `${apiUrl.replace(/\/$/, "")}/:path*`,
        },
      ];
    }
    // Dev: proxy to local Go API
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8080/:path*",
      },
    ];
  },
};

export default nextConfig;
