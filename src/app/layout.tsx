import type { Metadata } from "next";
import "./globals.css";
import "./household-theme.css";

export const metadata: Metadata = {
  title: "Housemates — A smarter energy plan",
  description: "Meet Evie, Bubbles, and Chill: household energy planning with simulated appliances and synthetic electricity data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
