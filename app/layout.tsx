import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Winamp Skin Oracle",
  description: "Answer three nonsensical questions. Receive a Winamp skin. It really whips.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
