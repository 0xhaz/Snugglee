import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

/** Rounded, warm, highly legible — the type equivalent of the app's geometry. */
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://snugglee.app"),
  title: "Snugglee — bedtime stories in your own voice",
  description:
    "A personalised bedtime story where your child is the hero, read aloud in your voice — even on the nights you can't be there.",
  openGraph: {
    title: "Snugglee — bedtime stories in your own voice",
    description:
      "A personalised bedtime story where your child is the hero, read aloud in your voice — even on the nights you can't be there.",
    url: "https://snugglee.app",
    siteName: "Snugglee",
    images: [{ url: "/stories/hero.jpg", width: 1024, height: 1024 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Snugglee — bedtime stories in your own voice",
    description:
      "Your child is the hero. You are the voice. Even when you're away.",
    images: ["/stories/hero.jpg"],
  },
};

/** themeColor belongs on `viewport`, not `metadata`. */
export const viewport: Viewport = {
  themeColor: "#2C2C4D",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
