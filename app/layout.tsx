import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Show List — Your next good watch",
  description: "Your personal movie and show watchlist, with verified US streaming availability.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
