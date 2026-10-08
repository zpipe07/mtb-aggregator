import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/siteUrl";
import { Providers } from "./providers";
import "./globals.css";

const defaultDescription =
  "Find the best mountain bike deals across top retailers. Compare prices on bikes, components, gear, and accessories.";

/** Impact.com site verification. Their crawler reads `value`, not `content`. */
const IMPACT_SITE_VERIFICATION = "210a2e23-86c5-4cc5-afb8-3290134970a0";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "The Dropper | MTB Deals",
    template: "%s | The Dropper",
  },
  description: defaultDescription,
  icons: {
    icon: [
      { url: "/favicon.png", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-light.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: [
      { url: "/favicon.png", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-light.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "The Dropper",
    title: "The Dropper | MTB Deals",
    description: defaultDescription,
    images: [
      {
        url: "/the-dropper-logo-horizontal.png",
        alt: "The Dropper — mountain bike deals",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Dropper | MTB Deals",
    description: defaultDescription,
    images: ["/the-dropper-logo-horizontal.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ZAC-314: raw tag so Impact sees `value`. Next metadata `other` emits `content`. */}
        <meta
          name="impact-site-verification"
          // @ts-expect-error Impact's verifier requires the non-standard `value` attribute.
          value={IMPACT_SITE_VERIFICATION}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                /* Workshop Modern ships a single light theme; legacy dark tokens looked green/orange. */
                document.documentElement.classList.remove('dark');
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
