import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sign-in", "/logo.svg", "/llms.txt"],
        disallow: [
          "/console",
          "/console/",
          "/settings",
          "/settings/",
          "/profile",
          "/profile/",
          "/access-denied",
          "/api/",
        ],
      },
      // Explicitly welcome major AI crawlers (user request: discoverable by AI agents).
      {
        userAgent: "GPTBot",
        allow: ["/", "/llms.txt", "/logo.svg"],
        disallow: ["/console", "/settings", "/profile", "/api/"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/llms.txt"],
        disallow: ["/console", "/settings", "/profile", "/api/"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/llms.txt", "/logo.svg"],
        disallow: ["/console", "/settings", "/profile", "/api/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/llms.txt", "/logo.svg"],
        disallow: ["/console", "/settings", "/profile", "/api/"],
      },
      {
        userAgent: "Anthropic-AI",
        allow: ["/", "/llms.txt"],
        disallow: ["/console", "/settings", "/profile", "/api/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/llms.txt", "/logo.svg"],
        disallow: ["/console", "/settings", "/profile", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
