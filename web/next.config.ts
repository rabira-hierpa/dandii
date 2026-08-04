import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The floating dev-tools badge sits bottom-left where the map's layers
  // button now lives.
  devIndicators: false,
};

// Cookie-based locale (no [locale] URL segment) — see src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
