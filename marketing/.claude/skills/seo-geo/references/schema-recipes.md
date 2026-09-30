# Schema Recipes

Copy-paste JSON-LD for Become. Every block below is honest against the product as it exists.
Nothing here emits a rating, a review count, a user count, or a price other than zero.

Render with one shared component so there is a single place to fix a mistake:

```tsx
// webapp/components/JsonLd.tsx
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

`@id` values are absolute and stable so entities can reference each other across pages.
Base: `https://become.redbtn.io`.

---

## 1. Organization + WebSite (landing page, once)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://become.redbtn.io/#organization",
      "name": "Become",
      "url": "https://become.redbtn.io",
      "logo": "https://become.redbtn.io/logo.png",
      "founder": { "@id": "https://become.redbtn.io/#jondon" },
      "sameAs": []
    },
    {
      "@type": "WebSite",
      "@id": "https://become.redbtn.io/#website",
      "url": "https://become.redbtn.io",
      "name": "Become",
      "publisher": { "@id": "https://become.redbtn.io/#organization" }
    }
  ]
}
```

`sameAs` stays empty until you have the real profile URLs. An invented handle is a fabrication.

## 2. WebApplication (landing page)

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": "https://become.redbtn.io/#app",
  "name": "Become",
  "url": "https://become.redbtn.io",
  "applicationCategory": "HealthApplication",
  "applicationSubCategory": "Fitness",
  "operatingSystem": "Any (web browser, installable as a PWA)",
  "browserRequirements": "Requires a modern browser. Camera features require camera permission.",
  "description": "Become is a web app for logging workouts, meals, mood, and weight, built around coach Jon Don. Coach-built multi-phase programs, an AI session generator, photo food logging, and a weekly recap.",
  "featureList": [
    "Coach-built multi-phase training programs",
    "AI session and program generator",
    "Demo clips on the main lifts",
    "LIVE mode that logs each set as you train, with rest timers, last-session numbers, and personal records on screen",
    "Photo meal logging that itemizes a plate",
    "Barcode scanning",
    "Calorie and macro targets",
    "Guided mind sessions and mood tracking",
    "Weight and strength trends with a weekly recap"
  ],
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "author": { "@id": "https://become.redbtn.io/#jondon" },
  "publisher": { "@id": "https://become.redbtn.io/#organization" },
  "screenshot": [
    "https://become.redbtn.io/screenshots/v2/dashboard-light.webp",
    "https://become.redbtn.io/screenshots/v2/workout-log-dark.webp",
    "https://become.redbtn.io/screenshots/v2/nutrition-meal-light.webp"
  ]
}
```

Rules:
- `featureList` may only contain capabilities in the product-truth list. If it is not in
  `marketing/.agents/become-context.md`, it does not go here.
- **No `aggregateRating`. No `interactionStatistic` with an invented count.** We have neither.
- `price: "0"` is literally true today. Do not add `priceValidUntil`, which implies a future
  price.
- Screenshot URLs must resolve. The files listed above exist in
  `webapp/public/screenshots/v2/`.

## 3. Person (Jon Don)

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://become.redbtn.io/#jondon",
  "name": "Jon Don",
  "jobTitle": "Coach",
  "description": "Coach who designs the training programs in Become.",
  "worksFor": { "@id": "https://become.redbtn.io/#organization" },
  "sameAs": []
}
```

Fill `description`, `knowsAbout`, and `sameAs` only with facts confirmed with Jon and recorded in
`marketing/.agents/become-context.md`, tagged `[verified with Jon]`. No invented certifications,
no invented client counts, no invented years of experience.

## 4. FAQPage (landing page FAQ section)

Emit only questions whose answers are **visible on the page**, word for word. Schema that does
not match visible content is a structured-data violation.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Become free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Become is free today. There is no credit card and no paid tier. You sign in with an email link."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need to download an app?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Become runs in your browser and installs to your home screen as a web app. There is no App Store download."
      }
    },
    {
      "@type": "Question",
      "name": "Does Become log my sets for me?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You log each set yourself, and LIVE mode makes it one tap. Last session's weight and reps sit on the screen while you train, along with a rest timer and your personal record for that lift, so you are deciding what to do next instead of remembering what you did last time."
      }
    },
    {
      "@type": "Question",
      "name": "What does photo food logging actually do?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You photograph the plate and Become itemizes what is on it, so a mixed meal becomes separate entries instead of one guess. You can also scan a barcode."
      }
    }
  ]
}
```

Every answer here is also a candidate AI-answer passage. Write them at 40 to 60 words and they do
double duty.

## 5. HowTo (T2 instructional pages)

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to set a training schedule you will actually keep",
  "totalTime": "PT5M",
  "step": [
    { "@type": "HowToStep", "name": "Pick the days, not the hours", "text": "Choose the days of the week you can train. Three real days beats five aspirational ones." },
    { "@type": "HowToStep", "name": "Attach each day to something fixed", "text": "Tie the session to an anchor that already happens: after work, before the school run." },
    { "@type": "HowToStep", "name": "Write the first session down", "text": "A named session removes the decision at the door. In Become, the program fills the schedule for you." }
  ]
}
```

No `estimatedCost`, no supply list, no medical guidance. If the how-to touches injury, pain, or
pregnancy, it gets the referral line from `coach-brand-voice` and no schema claim of a remedy.

## 6. VideoObject (exercise pages with a demo clip)

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Lat pulldown demonstration",
  "description": "A full repetition of the lat pulldown, shown from the side.",
  "contentUrl": "https://become.redbtn.io/exercises/lat-pulldown.mov",
  "thumbnailUrl": "https://become.redbtn.io/og/exercises/lat-pulldown.png",
  "uploadDate": "2026-01-01",
  "duration": "PT6S",
  "isFamilyFriendly": true
}
```

Traps:
- **Only 39 of the 132 exercises have a clip.** Emit `VideoObject` on those pages and omit it
  everywhere else. A `VideoObject` pointing at a file that does not exist is a structured-data
  error on every page that carries it.
- **There is usually no `.mp4` twin.** Only `back-squat`, `bench-press`, and `cable-row` have one;
  the other 36 clips are `.mov` only, so `contentUrl` points at the `.mov`. The files are served
  with `Content-Type: video/mp4` and play fine. The Chromium black panel is a separate bug in
  `webapp/components/FramedVideo.tsx:39`, which emits `type="video/quicktime"` on the `<source>`;
  the fix is omitting or correcting that attribute, not swapping the file.
- `uploadDate` and `duration` must be real values read from the file, not placeholders.
- `thumbnailUrl` must resolve to a real image. Generate it with `image-production`.

## 7. BreadcrumbList (any nested route)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Exercises", "item": "https://become.redbtn.io/exercises" },
    { "@type": "ListItem", "position": 2, "name": "Back", "item": "https://become.redbtn.io/exercises/muscle/back" },
    { "@type": "ListItem", "position": 3, "name": "Lat pulldown" }
  ]
}
```

The last item has no `item` URL by convention.

## 8. Validation before merge

- Google Rich Results Test on the deployed beta URL, then production.
- Schema.org validator for anything Google does not have a rich-result type for.
- `curl -s https://become.redbtn.io | grep -c 'application/ld+json'` returns the count you expect.
- Wrap any local audit in `timeout`, for example
  `timeout 120 npx --yes @schemastore/validate ...`.

## 9. Properties we never emit

| Property | Why not |
|---|---|
| `aggregateRating`, `ratingValue`, `reviewCount` | We have no ratings. Fabricating one is both a manual-action risk and a violation of the no-fabrication rule. |
| `review` with an invented author | Fabricated testimonial. |
| `interactionStatistic` user counts | We do not publish counts. |
| `priceValidUntil`, `discount`, `trial` | Implies a future price or a trial. Neither exists. |
| `award`, `endorsement` | Unverified. |
| Health outcome claims in `description` | No medical claims, no promised results. |
