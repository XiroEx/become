# Technical Checklist: the files Become does not have yet

Verified against the repo on 2026-08-25. Every item below is missing unless noted. Paths are
repo-relative. Next.js 16 App Router conventions.

---

## 1. `webapp/app/robots.ts`

Next generates `/robots.txt` from this file. Explicit allow list, explicit AI crawlers.

```ts
import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://become.redbtn.io";
const isProd = base === "https://become.redbtn.io";

export default function robots(): MetadataRoute.Robots {
  if (!isProd) {
    // Beta shares the production database and the production copy.
    // It must never compete in the index.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const disallow = ["/api/", "/dashboard/", "/verify", "/onboarding", "/share/mind/"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Answer engines. Allowing them is how we become citable.
      { userAgent: "GPTBot", allow: "/", disallow },
      { userAgent: "OAI-SearchBot", allow: "/", disallow },
      { userAgent: "ChatGPT-User", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow },
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "Bingbot", allow: "/", disallow },
      { userAgent: "CCBot", allow: "/", disallow },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
```

Notes:
- `/verify` carries single-use magic-link tokens. Disallowing it is necessary but not sufficient;
  also return `robots: { index: false, follow: false }` from its own `generateMetadata`.
- `/share/mind/[token]` is token-addressed private content. `/share/[shareId]` is a deliberately
  public snapshot and may stay indexable, but see the caution in section 6.

## 2. `webapp/app/sitemap.ts`

```ts
import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://become.redbtn.io";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes = ["", "/login", "/register"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.5,
  }));
  // When the exercise corpus ships, append its routes here from the Exercise
  // model, filtered to documents that actually have instructions and cues.
  return staticRoutes;
}
```

Rules:
- Never list a `noindex` route. A sitemap entry plus a noindex tag is a contradiction crawlers
  log as an error.
- `lastModified` must be real. A file-wide `new Date()` on a page that has not changed in a year
  trains crawlers to ignore the signal.
- If the corpus grows past 10,000 URLs, split with a sitemap index. Not a near-term concern.

## 3. `webapp/public/llms.txt`

Plain markdown, factual, no adjectives, no claims. Answer engines read it as a map.

```markdown
# Become

Become is a free web app for logging workouts, meals, mood, and weight, built around
coach Jon Don. It runs in the browser and installs as a PWA. There is no native app.
Sign-in is an email magic link. No credit card. Free today.

## What it does
- Training: coach-built multi-phase programs, an AI session and program generator,
  exercise demo videos, set logging with personal-record history, and a LIVE mode that
  counts reps through the phone camera.
- Nutrition: photo logging that itemizes a whole plate, barcode scanning, and personal
  calorie and macro targets.
- Mind: short guided sessions, mood tracking, identity work.
- Progress: weight and strength trends plus a weekly recap.

## Pages
- https://become.redbtn.io/ : product overview and signup
- https://become.redbtn.io/register : create an account with an email link

## Contact
- Site: https://become.redbtn.io
```

Keep it under about 60 lines. Update it in the same commit as any feature launch, or it becomes
the most confidently wrong description of Become on the internet.

## 4. Root metadata in `webapp/app/layout.tsx`

Today: `title: appName`, `description: appTagline`, `manifest: "/manifest.json"`, a minimal
`openGraph`, and `appleWebApp`. There is no `metadataBase`, no canonical, no Twitter card.

Add:

```ts
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://become.redbtn.io"),
  title: {
    default: "Become: free workout and nutrition tracking with a coach-built plan",
    template: "%s | Become",
  },
  description:
    "Log workouts, scan meals, and see your week. Coach-built programs, photo food logging, and a weekly recap. Free, no credit card, sign in with an email link.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Become",
    url: "/",
    images: [{ url: "/og/become-og.png", width: 1200, height: 630, alt: "The Become dashboard on a phone" }],
  },
  twitter: { card: "summary_large_image" },
  manifest: "/manifest.json",
};
```

Cautions:
- The existing `appName` env read is deliberate: production renders "BECOME" and beta renders
  "BECOME (beta)". Do not route the new SEO title through `NEXT_PUBLIC_APP_NAME` or beta's
  "(beta)" lands in a title tag. Use a literal string and let robots handle the beta channel.
- The OG image must be produced by `image-production` from a `screenshots/v2` capture. Do not
  point at a capture directly; OG needs 1200x630 with safe padding.
- `webapp/app/manifest.json` already exists and is served at `/manifest.json`. Do not create a
  second one in `public/`.

## 5. Per-route metadata

Every public route gets `generateMetadata` (or a static `metadata` export) with a unique title,
a unique description, and a canonical. Duplicate descriptions across routes are a wasted signal.

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const ex = await getExercise(params.slug);
  if (!ex) return { title: "Exercise not found", robots: { index: false } };
  return {
    title: `${ex.name}: form cues, common mistakes, and alternatives`,
    description: `How to do the ${ex.name.toLowerCase()}. Setup, cues, the mistakes people make, and swaps when you do not have the equipment.`,
    alternates: { canonical: `/exercises/${ex.slug}` },
    openGraph: { images: [{ url: `/og/exercises/${ex.slug}.png`, width: 1200, height: 630 }] },
  };
}
```

`/verify` and `/onboarding`:

```ts
export const metadata: Metadata = { robots: { index: false, follow: false } };
```

## 6. Ordering and gotchas

Ship in this order. Each step is cheap and each unblocks the next.

1. `robots.ts` and beta lockout.
2. Root metadata, `metadataBase`, canonical, OG, Twitter.
3. One OG image, produced by `image-production`.
4. `sitemap.ts`.
5. JSON-LD on the landing page (see `references/schema-recipes.md`).
6. `llms.txt`.
7. FAQ section on the landing page, plus `FAQPage` schema matching the visible text.
8. Comparison and alternatives pages.
9. Exercise corpus pilot, 20 pages.

Gotchas:
- **Client-side rendering.** Anything an engine must read has to be server-rendered. The landing
  page is a client component tree; confirm the copy is in the initial HTML before assuming it is
  readable. `curl` the page and grep for the headline.
- **Public share pages.** `/share/[shareId]` snapshots carry a real user's program title and
  `ownerName`. Before letting them into the sitemap, confirm with the team that publishing a
  member's name to the index is acceptable. Default to leaving them out of the sitemap while
  still allowing them to be linked.
- **Verification.** Google Search Console and Bing Webmaster Tools need a verification file or
  DNS record. Add the Search Console property for both `https://become.redbtn.io` and the domain
  property. Never commit a verification token that is also an auth secret; the GSC HTML token is
  not sensitive but keep it in the metadata `verification` field, not in a random file.
- **Bounded commands.** Any crawl or audit you run locally goes through `timeout`, for example
  `timeout 120 npx --yes lighthouse https://become.redbtn.io --only-categories=seo`.
