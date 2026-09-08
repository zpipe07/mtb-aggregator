import type { ImgHTMLAttributes } from "react";

/**
 * Retailer and giveaway images come from arbitrary third-party CDNs.
 * `next/image` would need an open hostname allowlist and would bill Vercel
 * Image Optimization for every deal card. Native `<img>` is intentional.
 */
export function RemoteImg({
  alt = "",
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element -- see file comment
  return <img alt={alt} {...props} />;
}
