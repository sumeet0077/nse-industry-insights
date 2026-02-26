// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | NSE Industry Insights",
    default: "NSE Industry Insights — Market Breadth Dashboard",
  },
  description:
    "Professional NSE market breadth and performance analytics for Indian equities. Track all sectors, industries, and themes in one place.",
  metadataBase: new URL("https://nseindustryinsights.com"),
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "NSE Industry Insights",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
