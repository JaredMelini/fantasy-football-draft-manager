import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "fantasy-draft-intelligence.jaredmelini2b.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "Draft Intelligence — Fantasy Football Draft Manager";
  const description =
    "League-specific fantasy football draft recommendations powered by your rankings, exact scoring settings, and live draft context.";

  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Draft Intelligence fantasy football analytics dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

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
