import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import MotionProvider from "@/components/MotionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Straight from the env, NOT the title-cased APP_NAME used by the manifest.
// Production has always rendered "BECOME" here and beta renders "BECOME (beta)";
// routing this through APP_NAME would have quietly restyled production's title
// to "Become" as a side effect of naming the beta channel.
const appName = process.env.NEXT_PUBLIC_APP_NAME || "BECOME";
const appTagline = process.env.NEXT_PUBLIC_APP_TAGLINE || "Transform your body and mind.";

const colorSchemeScript = `
  (() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyColorScheme = (isDark) => {
      root.classList.toggle("dark", isDark);
      root.classList.toggle("light", !isDark);
    };

    applyColorScheme(media.matches);

    const handleChange = (event) => applyColorScheme(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
    } else {
      media.addListener(handleChange);
    }
  })();
`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
};

export const metadata: Metadata = {
  title: appName,
  description: appTagline,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: appName,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorSchemeScript }} />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
