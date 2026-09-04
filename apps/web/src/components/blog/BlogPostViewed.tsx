"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

export function BlogPostViewed({ slug }: { slug: string }) {
  useEffect(() => {
    posthog.capture("blog_post_viewed", { slug });
  }, [slug]);

  return null;
}
