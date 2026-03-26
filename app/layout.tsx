import type { Metadata, Viewport } from "next";
import { SwRegister } from "@/components/hub/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Hub",
  description: "Mobile control center for Claude Code instances",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
        className="bg-hub-bg text-hub-text antialiased min-h-dvh"
      >
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
