import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/cron/", "/deals/*/price-history"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
