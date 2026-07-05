import type { Metadata } from "next";
import "./globals.css";

const description =
  "Answer three nonsensical questions. Receive a Winamp skin. It really whips.";

export const metadata: Metadata = {
  title: "Winamp Skin Oracle",
  description,
  openGraph: {
    title: "Winamp Skin Oracle",
    description,
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
