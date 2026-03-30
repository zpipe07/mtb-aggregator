import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/siteUrl";
import { Providers } from "./providers";
import "./globals.css";

const defaultDescription =
  "Find the best mountain bike deals across top retailers. Compare prices on bikes, components, gear, and accessories.";

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
  },
  twitter: {
    card: "summary_large_image",
    title: "The Dropper | MTB Deals",
    description: defaultDescription,
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var stored = localStorage.getItem('theme');
                var dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (dark) document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
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
