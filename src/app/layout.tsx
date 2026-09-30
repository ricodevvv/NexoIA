import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { THEME_COLORS } from "@/components/theme-colors";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-serif" });

const description = "Chat con IA para cualquier modelo: Claude, GPT y los que traigas tú. Con tools MCP, artifacts, proyectos y Nexo Code.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3001"),
  title: { default: "Nexo", template: "%s · Nexo" },
  applicationName: "Nexo",
  description,
  openGraph: { type: "website", siteName: "Nexo", title: "Nexo", description },
  twitter: { card: "summary_large_image", title: "Nexo", description },
  appleWebApp: { capable: true, title: "Nexo", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

const themeScript = `try{var t=localStorage.getItem("nexo-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var m=document.createElement("meta");m.id="nexo-theme-color";m.name="theme-color";m.content=${JSON.stringify(THEME_COLORS)}[t];document.head.prepend(m)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={serif.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
