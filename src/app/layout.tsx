import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "Nexo", template: "%s · Nexo" },
  description: "Chat con IA: Claude, GPT y cualquier modelo compatible, con tools MCP.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
};

const themeScript = `try{var t=localStorage.getItem("nexo-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

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
