import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: isGithubActions ? "export" : undefined,
  trailingSlash: isGithubActions,
  basePath: isGithubActions ? "/medication-app" : "",
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: isGithubActions ? "/medication-app" : "" },
};

export default nextConfig;
