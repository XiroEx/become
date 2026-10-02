/**
 * ONE RESOLVER: A WEB PATH IN, A NATIVE ROUTE OUT.
 *
 * The server only ever speaks in WEB paths. Verification emails link to
 * `/verify?token=…&mode=…` and the deletion email to
 * `/account/restore?u=…&t=…`; every push the notify cron sends carries a
 * `url` (`/dashboard`, `/dashboard/calendar`, `/dashboard/nutrition`,
 * `/dashboard/mind`, `/dashboard/streaks`, and the goal-nudge urls from
 * `webapp/lib/goals/suggestions.ts`); every widget row carries a `deepLink`
 * (`/dashboard/streaks`, `/dashboard/nutrition`, `/dashboard/mind`,
 * `/dashboard/mind/becoming`, `/dashboard/workout`); and every dashboard
 * suggestion card carries a `primaryAction.href`. None of those names exist
 * natively: the app's routes are `/(tabs)/dashboard`, `/(tabs)/programming`,
 * `/(tabs)/nutrition`, and so on.
 *
 * Before this module there were three partial answers and no whole one: two
 * hand-written parsers (`lib/auth/deepLinkHandler.ts` for verify,
 * `lib/account/deleteAccount.ts` for restore) and a push router keyed on
 * notification CATEGORIES the server has never sent. Everything else opened
 * the app on an unmatched route.
 *
 * So: one table, here, and every entry point reads it — `app/+native-intent.tsx`
 * (which expo-router calls for EVERY incoming link, the cold-start one
 * included), the notification tap handler (NP-066), widget taps (NP-181) and
 * suggestion cards (NP-114).
 *
 * TWO RULES TRAVEL WITH THE TABLE:
 *
 *  1. One mapping for every entry point. A row added here is added for links,
 *     notifications, widgets and cards at the same time.
 *  2. A row whose native screen is not built yet falls back DELIBERATELY — to
 *     the tab that owns the subject, or to Home — and says so in `fallback`.
 *     Never to a blank screen, and never to an unmatched route.
 *
 * It is pure: a string in, a plain object out, no router and no navigation.
 * `__tests__/webPathToRoute.test.ts` drives it with every url the server's own
 * sources contain (it READS `webapp/app/api/cron/notify/route.ts`,
 * `webapp/lib/widgets/feed.ts` and `webapp/lib/goals/suggestions.ts`), so a new
 * url on the server fails the native suite until it has a row here.
 */

import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";

/**
 * The hosts a Become link can arrive on. BOTH product domains, because email
 * and push are built from `NEXT_PUBLIC_APP_URL` and that value differs per
 * channel (`become.redbtn.io` in production, `become-beta.redbtn.io` on beta),
 * while `becomeurbest.com` is the marketing domain the same links are served
 * on. A host that is not on this list is NOT ours, and a link from it resolves
 * to Home rather than being followed into the app.
 */
export const BECOME_WEB_HOSTS: readonly string[] = [
  "become.redbtn.io",
  "www.become.redbtn.io",
  "become-beta.redbtn.io",
  "becomeurbest.com",
  "www.becomeurbest.com",
];

/** The custom scheme declared by `app.json` (`"scheme": "become"`). */
export const BECOME_APP_SCHEME = "become";

export function isBecomeWebHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return BECOME_WEB_HOSTS.includes(host.toLowerCase());
}

/**
 * The native routes this table can land on. Named rather than repeated so a
 * route rename is one edit, and so a test can assert against the same names.
 */
export const NATIVE_ROUTES = {
  /** `app/index.tsx` — the launch decision (sign-in, onboarding or Home). */
  launch: "/",
  login: "/login",
  verify: "/verify",
  accountRestore: "/account/restore",
  onboarding: "/onboarding",
  home: "/(tabs)/dashboard",
  /** The Workout tab — `programming` is the folder name, Workout is the label. */
  workout: "/(tabs)/programming",
  browsePrograms: "/(tabs)/programming/browse",
  savedPrograms: "/(tabs)/programming/saved",
  programSearch: "/(tabs)/programming/search",
  mind: "/(tabs)/mind",
  nutrition: "/(tabs)/nutrition",
  nutritionSearch: "/(tabs)/nutrition/search",
  recipes: "/(tabs)/nutrition/recipes",
  mealSchedule: "/(tabs)/nutrition/meal-schedule",
  calendar: "/(tabs)/calendar",
  scheduleSettings: "/(tabs)/calendar/settings",
  streaks: "/(tabs)/dashboard/streaks",
  chat: "/(tabs)/chat",
} as const;

/**
 * WHY this route and not another — the half of the answer a fallback needs so
 * that "it went Home" is a decision on the record instead of a shrug.
 *
 *   exact    — the native screen for this row; nothing was lost.
 *   nearest  — the native screen does not exist yet (or the link did not carry
 *              enough to address it), so this is the closest screen that still
 *              means something. Deliberate, and never blank.
 *   hidden   — the surface is deliberately hidden in the v1 build (chat and
 *              community, NP-032). Home until that flag opens them.
 *   unknown  — not a path we recognise. Home.
 */
export type RouteFallback = "exact" | "nearest" | "hidden" | "unknown";

export interface NativeTarget {
  kind: "native";
  /** Ready for `router.push()` / `redirectSystemPath()` — path plus query. */
  href: string;
  /** The route alone, without the query. */
  pathname: string;
  /** Query carried through from the web url, already decoded. */
  params: Record<string, string>;
  fallback: RouteFallback;
}

export interface WebTarget {
  kind: "web";
  /**
   * A bare Become path, no query — the shape `openWebSignedIn()` (NP-121)
   * accepts, because the server's hand-off allow-list refuses anything else.
   */
  path: string;
  /** The same target with its query, for a plain (signed-out) browser open. */
  href: string;
  fallback: "web-only";
}

export type ResolvedTarget = NativeTarget | WebTarget;

export interface ResolveOptions {
  /**
   * NP-032 hides chat and community in the v1 build. While it is false — the
   * default, and what ships — those paths resolve to Home rather than to the
   * routes that still exist in the tree. Flip it and the same table routes
   * them properly; there is deliberately no second mapping to keep in step.
   */
  communityEnabled?: boolean;
}

interface Incoming {
  /** Percent-decoded, empty segments dropped: `/dashboard/mind/` → ["dashboard","mind"]. */
  segments: string[];
  /** The path as it arrived, still encoded, for handing back to the web. */
  rawPathname: string;
  params: Record<string, string>;
}

function lower(value: string | undefined): string {
  return (value ?? "").toLowerCase();
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Build the query the way the web built it: `encodeURIComponent` per value.
 * `URLSearchParams.toString()` would write a space as `+`, which is correct for
 * a form body and wrong for a route param — "Day 2" has to survive as
 * `day=Day%202` or the live workout loses its day label.
 */
function withQuery(pathname: string, params: Record<string, string>): string {
  const pairs = Object.entries(params).map(
    ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
  );
  return pairs.length > 0 ? `${pathname}?${pairs.join("&")}` : pathname;
}

function native(
  pathname: string,
  params: Record<string, string>,
  fallback: RouteFallback,
): NativeTarget {
  return { kind: "native", href: withQuery(pathname, params), pathname, params, fallback };
}

function web(rawPathname: string, params: Record<string, string>): WebTarget {
  return {
    kind: "web",
    path: rawPathname,
    href: withQuery(rawPathname, params),
    fallback: "web-only",
  };
}

/**
 * Accepts all four shapes a Become link arrives in:
 *
 *   `/dashboard/streaks`                         a bare path (push `url`,
 *                                                widget `deepLink`, card href,
 *                                                and what expo-router hands
 *                                                `+native-intent`)
 *   `https://become.redbtn.io/dashboard/streaks` a universal link / App Link
 *   `https://becomeurbest.com/dashboard/streaks` the other domain
 *   `become://dashboard/streaks`                 the custom scheme
 *
 * Returns null for anything else — another host, another scheme, or a string
 * that is not a URL at all — which the caller turns into Home. A foreign host
 * must never be able to steer the app.
 */
function parseIncoming(raw: string): Incoming | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    if (trimmed.startsWith("/")) {
      // `//evil.example/x` is a protocol-relative URL, not a path.
      if (trimmed.startsWith("//")) return null;
      url = new URL(trimmed, `https://${BECOME_WEB_HOSTS[0]}`);
    } else {
      url = new URL(trimmed);
      const scheme = url.protocol.replace(":", "").toLowerCase();
      if (scheme === BECOME_APP_SCHEME) {
        // `become://dashboard/streaks` parses as host "dashboard" + path
        // "/streaks"; `become://?billing=success` as host "" + path "".
        const joined = `/${url.hostname}${url.pathname}`.replace(/\/{2,}/g, "/");
        url = new URL(`${joined}${url.search}`, `https://${BECOME_WEB_HOSTS[0]}`);
      } else if (scheme === "https" || scheme === "http") {
        if (!isBecomeWebHost(url.hostname)) return null;
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }

  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    // First value wins: `?date=a&date=b` is a mistake, not a list.
    if (!(key in params)) params[key] = value;
  });

  return {
    segments: url.pathname.split("/").filter(Boolean).map(decodeSegment),
    rawPathname: url.pathname,
    params,
  };
}

/** `/(tabs)/…`, `/(app)/…`, `/_stories` — already a native route, not a web path. */
function isAlreadyNative(rawPathname: string): boolean {
  return rawPathname.startsWith("/(") || rawPathname.startsWith("/_");
}

/**
 * Resolve one web path (or full url) to the native route that serves it.
 *
 * Always returns a target: there is no null, because every caller has to open
 * SOMETHING and an unmatched route is a blank screen.
 */
export function resolveWebPath(
  input: string | null | undefined,
  options: ResolveOptions = {},
): ResolvedTarget {
  if (typeof input !== "string") {
    return native(NATIVE_ROUTES.home, {}, "unknown");
  }

  const incoming = parseIncoming(input);
  if (!incoming) return native(NATIVE_ROUTES.home, {}, "unknown");

  // A route this app already owns passes through untouched. `+native-intent`
  // sees these whenever the app links to itself, and rewriting them would be
  // this module inventing a bug of its own.
  if (isAlreadyNative(incoming.rawPathname)) {
    return native(incoming.rawPathname, incoming.params, "exact");
  }

  return matchPath(incoming, options);
}

/**
 * The one-call form for a caller that just needs somewhere to navigate: the
 * native href, with web-only paths collapsed to Home (the caller that can open
 * a browser — `+native-intent` — uses `resolveWebPath` and handles `kind`).
 */
export function nativeRouteFor(
  input: string | null | undefined,
  options: ResolveOptions = {},
): string {
  const target = resolveWebPath(input, options);
  return target.kind === "native" ? target.href : NATIVE_ROUTES.home;
}

// ── The table ────────────────────────────────────────────────────────────────

function matchPath(incoming: Incoming, options: ResolveOptions): ResolvedTarget {
  const { segments, params, rawPathname } = incoming;
  const head = lower(segments[0]);

  // ── The public app: launch, auth, account, billing return ─────────────────
  if (segments.length === 0) {
    // `/` — and `become://?billing=success&session_id=…`, which is how the
    // billing return pages come back into the app. There is no native billing
    // screen, so the params ride along to the launch route, which always
    // resolves (sign-in, onboarding or Home) and is never blank.
    return native(NATIVE_ROUTES.launch, params, "exact");
  }

  if (head === "verify") return native(NATIVE_ROUTES.verify, params, "exact");
  if (head === "login" || head === "register") {
    // Native has one passwordless screen; the web's /register is the same act.
    return native(NATIVE_ROUTES.login, params, head === "login" ? "exact" : "nearest");
  }
  if (head === "onboarding") return native(NATIVE_ROUTES.onboarding, params, "exact");
  if (head === "account" && lower(segments[1]) === "restore") {
    return native(NATIVE_ROUTES.accountRestore, params, "exact");
  }
  if (head === "billing" || (head === "auth" && segments.length > 1)) {
    // `/billing/return`, `/billing/cancelled`, `/billing/portal-return` and
    // `/auth/finish|handoff` are web pages the app has no screen for. The
    // launch route, carrying whatever they said, is the deliberate landing.
    return native(NATIVE_ROUTES.launch, params, "nearest");
  }

  // Web-only surfaces: admin and dev tooling (staff, heavy forms), the legal
  // and support pages, and public share links. These open on the web through
  // NP-121's signed-in hand-off rather than pretending to have a screen.
  if (
    head === "privacy" ||
    head === "terms" ||
    head === "support" ||
    head === "information" ||
    head === "health-data" ||
    head === "delete-account" ||
    head === "share"
  ) {
    return web(rawPathname, params);
  }

  if (head === "mind") {
    return segments.length === 1
      ? native(NATIVE_ROUTES.mind, params, "exact")
      : native(NATIVE_ROUTES.mind, params, "nearest");
  }
  if (head === "programming" || head === "workout") {
    return native(NATIVE_ROUTES.workout, params, "exact");
  }
  if (head === "nutrition") {
    return native(NATIVE_ROUTES.nutrition, params, "exact");
  }
  if (head === "calendar") {
    return native(NATIVE_ROUTES.calendar, params, "exact");
  }

  if (head !== "dashboard") {
    return native(NATIVE_ROUTES.home, params, "unknown");
  }

  const section = lower(segments[1]);

  // ── /dashboard ────────────────────────────────────────────────────────────
  if (segments.length === 1) return native(NATIVE_ROUTES.home, params, "exact");

  if (section === "admin" || section === "dev") {
    return web(rawPathname, params);
  }

  // ── Chat and community — hidden in v1 behind NP-032's flag ────────────────
  if (section === "chat") {
    if (!options.communityEnabled) return native(NATIVE_ROUTES.home, params, "hidden");
    const conversationId = segments[2];
    return conversationId
      ? native(`${NATIVE_ROUTES.chat}/${encodeURIComponent(conversationId)}`, params, "exact")
      : native(NATIVE_ROUTES.chat, params, "exact");
  }
  if (section === "community" || section === "groups" || section === "events") {
    // No native screen at all, flag or no flag: the web shows these as
    // "Coming soon" to everyone but an admin.
    return native(NATIVE_ROUTES.home, params, "hidden");
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  if (section === "calendar") {
    if (lower(segments[2]) === "settings") {
      return native(NATIVE_ROUTES.scheduleSettings, params, "exact");
    }
    // `?date=YYYY-MM-DD` is how the web opens a specific day; it rides along
    // for the native calendar (NP-110) to read.
    return native(NATIVE_ROUTES.calendar, params, "exact");
  }

  // ── Nutrition ─────────────────────────────────────────────────────────────
  if (section === "nutrition") {
    const sub = lower(segments[2]);
    if (!sub) {
      // The web's day is a query param on one page (/dashboard/nutrition?date=...)
      // Registered here (NP-034/NP-091) so pushes and widgets open this screen.
      return native(NATIVE_ROUTES.nutrition, params, "exact");
    }
    if (sub === "recipes") return native(NATIVE_ROUTES.recipes, params, "exact");
    if (sub === "meal-schedule") return native(NATIVE_ROUTES.mealSchedule, params, "exact");
    // goals, scans — nothing native yet (NP-091 and friends).
    return native(NATIVE_ROUTES.nutrition, params, "nearest");
  }
  if (section === "recipes") {
    const id = segments[2];
    const isEditor = !id || lower(id) === "new" || lower(segments[3]) === "edit";
    return isEditor
      ? native(NATIVE_ROUTES.recipes, params, "nearest")
      : native(`${NATIVE_ROUTES.recipes}/${encodeURIComponent(id)}`, params, "exact");
  }
  if (section === "foods") {
    const id = segments[2];
    return !id || lower(id) === "new"
      ? native(NATIVE_ROUTES.nutrition, params, "nearest")
      : native(`${NATIVE_ROUTES.nutrition}/food/${encodeURIComponent(id)}`, params, "exact");
  }
  if (section === "meals" || section === "meal-plan" || section === "timeline") {
    return native(NATIVE_ROUTES.nutrition, params, "nearest");
  }

  // ── Mind ──────────────────────────────────────────────────────────────────
  if (section === "mind") {
    // `/dashboard/mind`, and every room off it — `becoming` (NP-192),
    // `arsenal`, `[section]` — land on the Mind tab until NP-097 ports them.
    return segments.length === 2
      ? native(NATIVE_ROUTES.mind, params, "exact")
      : native(NATIVE_ROUTES.mind, params, "nearest");
  }

  // ── Training ──────────────────────────────────────────────────────────────
  if (section === "workout") return matchWorkout(segments, params);
  if (section === "programs") {
    const sub = lower(segments[2]);
    if (sub === "mine") return native(NATIVE_ROUTES.savedPrograms, params, "nearest");
    if (sub === "browse") return native(NATIVE_ROUTES.browsePrograms, params, "exact");
    // `new` and `[programId]/edit` are the program editor (NP-135): no native
    // screen, and a member-facing surface we do not link out of in v1.
    return native(NATIVE_ROUTES.workout, params, "nearest");
  }
  if (section === "history" || section === "progress" || section === "insights") {
    // Training history, the charts and a single metric: the Workout tab owns
    // the subject until those screens exist.
    return native(NATIVE_ROUTES.workout, params, "nearest");
  }

  // ── Streaks detail screen (NP-108) ─────────────────────────────────────────
  if (section === "streaks") {
    return native(NATIVE_ROUTES.streaks, params, "exact");
  }

  // ── Home's own rooms: plan, settings, profile, customize ───────────────────
  if (
    section === "plan" ||
    section === "settings" ||
    section === "profile" ||
    section === "customize"
  ) {
    return native(NATIVE_ROUTES.home, params, "nearest");
  }

  // Anything else under /dashboard: Home, and say it was a guess.
  return native(NATIVE_ROUTES.home, params, "unknown");
}

/**
 * `/dashboard/workout/**` — the one family where the query is load-bearing.
 *
 * The web addresses a session by DAY LABEL (`?day=Day%202`) and, for a
 * scheduled slot, by its exact slot date (`?sd=2026-09-29`); native addresses
 * the workout by INDEX (`/(tabs)/programming/[id]/workout/[idx]/live`).
 * `workoutIndexFromDayLabel` is the translation, and it is imported rather than
 * re-written because `lib/schedule/scheduleSlots.ts` already does it for the
 * calendar. Both values are then carried through on the query, because the
 * label is what the live screen prints and `sd` is what the save body needs
 * (NP-078, NP-110) — losing them here would be losing them for good.
 */
function matchWorkout(
  segments: string[],
  params: Record<string, string>,
): ResolvedTarget {
  const programId = segments[2];

  // `/dashboard/workout`
  if (!programId) return native(NATIVE_ROUTES.workout, params, "exact");

  const sub = lower(programId);
  // `/dashboard/workout/hub`, `/library`, `/create`, `/quick-session` are
  // pages, not program ids. None is built natively; the Workout tab is home.
  if (sub === "hub" || sub === "library" || sub === "create" || sub === "quick-session") {
    return native(NATIVE_ROUTES.workout, params, "nearest");
  }
  if (sub === "browse") return native(NATIVE_ROUTES.browsePrograms, params, "exact");

  const third = lower(segments[3]);

  // A quick session has no program and no native screen (its id lives in
  // `?session=`), so it lands on the Workout tab with the id still attached.
  if (sub === "quick") return native(NATIVE_ROUTES.workout, params, "nearest");

  const program = `${NATIVE_ROUTES.workout}/${encodeURIComponent(programId)}`;

  if (!third) return native(program, params, "exact");
  if (third === "schedule") {
    // Picking training days: native does it in the schedule settings screen.
    return native(NATIVE_ROUTES.scheduleSettings, params, "nearest");
  }
  if (third === "journey") return native(program, params, "nearest");
  if (third !== "workout") return native(program, params, "nearest");

  const live = lower(segments[4]) === "live";
  const day = params.day;
  if (!day) {
    // No day label: nothing addresses a workout, so the program screen — where
    // the member picks one — is the honest landing.
    return native(program, params, "nearest");
  }

  const idx = workoutIndexFromDayLabel(day);
  const pathname = `${program}/workout/${idx}${live ? "/live" : ""}`;
  return native(pathname, params, "exact");
}

