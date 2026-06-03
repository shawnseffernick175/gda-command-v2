import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const plexMono = localFont({
  src: [
    { path: "../../public/fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/IBMPlexMono-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/IBMPlexMono-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

const plexSans = localFont({
  src: [
    { path: "../../public/fonts/IBMPlexSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/IBMPlexSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/IBMPlexSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/IBMPlexSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GDA Command Center",
  description: "Federal contract intelligence platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plexMono.variable} ${plexSans.variable}`}>
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; connect-src 'self' https://gda-v3.csr-llc.tech http://localhost:4000; font-src 'self' data:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-eval' 'unsafe-inline';"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
