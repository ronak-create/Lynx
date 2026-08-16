import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lynx · See any company clearly",
    template: "%s · Lynx",
  },
  description:
    "Type a company or paste a URL. Fifteen research agents fan out across public sources and return a live dashboard, a knowledge graph, a documentary, and live job postings.",
  applicationName: "Lynx",
  keywords: ["company research", "knowledge graph", "SEC EDGAR", "due diligence", "open source"],
  authors: [{ name: "Ronak Parmar", url: "https://github.com/ronak-create" }],
  openGraph: {
    type: "website",
    siteName: "Lynx",
    title: "Lynx · See any company clearly",
    description:
      "Fifteen research agents, twenty public sources, one pass: dashboard, knowledge graph, documentary and live roles.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lynx · See any company clearly",
    description:
      "Fifteen research agents, twenty public sources, one pass: dashboard, knowledge graph, documentary and live roles.",
  },
};

// Set data-theme before paint so there is no light/dark flash on load.
const themeScript = `(function(){try{var m=(JSON.parse(localStorage.getItem('lynx-theme')||'{}').state||{}).mode||'system';var d=m==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):m;document.documentElement.dataset.theme=d;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
