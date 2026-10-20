import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import MotionProvider from "@/components/MotionProvider";
import { getRuntimeConfig } from "@/lib/runtimeConfig";
import { extractAppleAppId } from "@/lib/appleAppId";
import { NATIVE_BROWSER_COOKIE } from "@/lib/nativeBrowserMarker";

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

const baseMetadata = {
  title: appName,
  description: appTagline,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default" as const,
    title: appName,
  },
};

// NP-205: Safari's own "Get the app" smart banner, driven by the
// apple-itunes-app meta tag — the iOS half of the store-banner requirement
// (Android gets components/GetAppBanner.tsx instead, since Chrome has no
// equivalent the server can drive). Dynamic rather than the static `metadata`
// export this used to be, for one reason: it must never render while this
// page was opened by the native app's own in-app browser (Tier-3 deep links),
// which Safari's rendering engine would otherwise still honour. See
// lib/nativeBrowserMarker.ts and middleware.ts for how that is known here.
//
// getRuntimeConfig() is wrapped the same way app/api/app/config/route.ts
// wraps it: this gate must fail OPEN (no tag) rather than take the whole site
// down if the secret store is briefly unreachable.
export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const openedByNativeApp = jar.get(NATIVE_BROWSER_COOKIE)?.value === "1";

  let appleAppId: string | undefined;
  try {
    const config = await getRuntimeConfig();
    appleAppId = extractAppleAppId(config.app.ios.storeUrl);
  } catch (error) {
    console.error("generateMetadata: could not resolve app store config:", error);
  }

  return {
    ...baseMetadata,
    ...(appleAppId && !openedByNativeApp
      ? { other: { "apple-itunes-app": `app-id=${appleAppId}` } }
      : {}),
  };
}

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
