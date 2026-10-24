import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal — AI News",
  description: "A calm, AI-assisted reader for the news that matters.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
