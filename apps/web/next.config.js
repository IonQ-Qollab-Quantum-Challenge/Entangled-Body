/** @type {import('next').NextConfig} */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  output: "export",

  ...(process.env.NODE_ENV === "production"
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${apiProxyTarget}/:path*`,
            },
          ];
        },
      }),
};

module.exports = nextConfig;
