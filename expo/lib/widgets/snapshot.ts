/**
 * THE LAST FEED THE APP SAW, compacted — what an App Widget paints when its
 * refresh has no network.
 *
 * A widget is redrawn by the OS on its own schedule, which is to say: at the
 * moment the phone happens to be in a lift. Without a cached copy that refresh
 * has three options and two of them are bugs — draw nothing (the member reads a
 * blank tile as a broken app), draw an error (a widget is not a place to report
 * one), or draw the last numbers we had. This is the third.
 *
 * TWO PROPERTIES, AND THEY ARE BOTH DELIBERATE:
 *
 *  • **It is small.** It lives in SecureStore, whose documented ceiling is 2048
 *    bytes per value, and it is written by a background task that must never
 *    fail loudly. So only the fields the four widgets DRAW are kept, every
 *    string is capped, and `encodeSnapshot` is held under `SNAPSHOT_BYTE_BUDGET`
 *    by `__tests__/widgetSnapshot.test.ts` with worst-case content.
 *
 *  • **It expires by DAY, not by clock.** Every number in the feed is scoped to
 *    the member's local day — calories left today, whether the streak has been
 *    fed today, today's Mind session. Yesterday's snapshot redrawn this morning
 *    would not be stale, it would be WRONG: "1,240 cal left" is a statement
 *    about a day that has ended. So a snapshot carries the `todayKey` the server
 *    built it for and is refused once the device's local day has moved on — the
 *    widget falls back to its "open Become" state instead of lying quietly.
 */
import type {
  BecomeWidget,
  WidgetFeed,
  WidgetKey,
  WidgetState,
} from "@become/api-client";
import {
  widgetsSnapshotSecureStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";
import { ANDROID_WIDGETS } from "@/lib/widgets/androidWidgets";

/** Everything one widget needs to draw, and nothing else. */
export interface WidgetSnapshotRow {
  key: WidgetKey;
  title: string;
  headline: string;
  headlineUnit: string | null;
  caption: string;
  state: WidgetState;
  /** 0..1 for the bar, or null when this widget has nothing to fill. */
  progress: number | null;
  /** Relative web path a tap opens, straight from the feed. */
  deepLink: string;
}

export interface WidgetSnapshot {
  /** Epoch ms the server built the feed. */
  generatedAt: number;
  /** The member's LOCAL day the numbers describe (YYYY-MM-DD). */
  todayKey: string;
  rows: WidgetSnapshotRow[];
}

/** Caps, so one long identity statement cannot cost every widget its cache. */
export const MAX_TITLE_CHARS = 24;
export const MAX_HEADLINE_CHARS = 32;
export const MAX_UNIT_CHARS = 16;
export const MAX_CAPTION_CHARS = 72;

/**
 * The size an encoded snapshot must stay under. Well inside SecureStore's 2048
 * bytes, with room for a fifth widget landing here later.
 */
export const SNAPSHOT_BYTE_BUDGET = 1600;

function cap(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function clampFraction(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/** One feed row, compacted. */
export function snapshotRow(row: BecomeWidget): WidgetSnapshotRow {
  return {
    key: row.key,
    title: cap(row.title, MAX_TITLE_CHARS),
    headline: cap(row.headline, MAX_HEADLINE_CHARS),
    headlineUnit: row.headlineUnit
      ? cap(row.headlineUnit, MAX_UNIT_CHARS)
      : null,
    caption: cap(row.caption, MAX_CAPTION_CHARS),
    state: row.state,
    progress: clampFraction(row.progress),
    deepLink: row.deepLink,
  };
}

/**
 * Compact a feed into the snapshot, keeping only the rows a widget draws.
 *
 * `todayKey` and `generatedAt` are optional on the wire (the schema allows a
 * server that omits them), so both get an answer here rather than becoming
 * `undefined` in storage: no `todayKey` means the snapshot can never be trusted
 * for a later day, which is the safe direction.
 */
export function snapshotFromFeed(
  feed: WidgetFeed,
  now: number = Date.now(),
): WidgetSnapshot {
  const wanted = new Set(ANDROID_WIDGETS.map((w) => w.feedKey));
  return {
    generatedAt: feed.generatedAt ?? now,
    todayKey: feed.todayKey ?? "",
    rows: feed.widgets.filter((w) => wanted.has(w.key)).map(snapshotRow),
  };
}

/** The row for a widget, or null. */
export function snapshotRowFor(
  snapshot: WidgetSnapshot | null,
  key: WidgetKey,
): WidgetSnapshotRow | null {
  if (!snapshot) return null;
  return snapshot.rows.find((r) => r.key === key) ?? null;
}

/**
 * Is this snapshot still about the day the device is in?
 *
 * `todayKey` is the member's local day as the SERVER resolved it, and the
 * comparison is against the device's local day. They can disagree by a day at
 * the boundary — a snapshot taken at 23:58 read at 00:02 — and when they do the
 * snapshot is the older answer and loses.
 */
export function snapshotIsForDay(
  snapshot: WidgetSnapshot | null,
  todayKey: string,
): boolean {
  if (!snapshot || !snapshot.todayKey) return false;
  return snapshot.todayKey === todayKey;
}

export function encodeSnapshot(snapshot: WidgetSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Parse a stored snapshot, or null.
 *
 * Anything unreadable is null rather than a throw: the value is written by a
 * previous build of this app and read by a background task, and a JSON change
 * between the two may not take a widget down.
 */
export function decodeSnapshot(raw: string | null): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<WidgetSnapshot>;
    if (!Array.isArray(candidate.rows)) return null;
    return {
      generatedAt:
        typeof candidate.generatedAt === "number" ? candidate.generatedAt : 0,
      todayKey: typeof candidate.todayKey === "string" ? candidate.todayKey : "",
      rows: candidate.rows.filter(isSnapshotRow),
    };
  } catch {
    return null;
  }
}

function isSnapshotRow(value: unknown): value is WidgetSnapshotRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<WidgetSnapshotRow>;
  return (
    typeof row.key === "string" &&
    typeof row.title === "string" &&
    typeof row.headline === "string" &&
    typeof row.caption === "string" &&
    typeof row.state === "string" &&
    typeof row.deepLink === "string"
  );
}

/** Persist the snapshot. Swallows a store failure: it is a cache. */
export async function saveSnapshot(
  snapshot: WidgetSnapshot,
  store: TokenStore = widgetsSnapshotSecureStore,
): Promise<void> {
  const encoded = encodeSnapshot(snapshot);
  try {
    await store.set(encoded);
  } catch {
    // A widget with no cache paints its "open Become" state, which is correct
    // and not worth failing a refresh over.
  }
}

/** Read the snapshot, or null. */
export async function loadSnapshot(
  store: TokenStore = widgetsSnapshotSecureStore,
): Promise<WidgetSnapshot | null> {
  try {
    return decodeSnapshot(await store.get());
  } catch {
    return null;
  }
}

/**
 * Drop the snapshot. Part of sign-out: the numbers are the member's day and
 * must not survive on the home screen of a device they signed out of.
 */
export async function clearSnapshot(
  store: TokenStore = widgetsSnapshotSecureStore,
): Promise<void> {
  try {
    await store.clear();
  } catch {
    // Nothing to do — the widget draws the sign-in prompt either way, because
    // that decision is made by the absence of a TOKEN, not of a snapshot.
  }
}
