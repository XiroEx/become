/**
 * Send feedback from a store build (NP-162).
 *
 * The web's user menu has "Send Feedback" (`webapp/components/FeedbackModal.tsx`
 * → `POST /api/feedback { type, message, images?, metadata? }`). Native had no
 * way to report a problem except email. This module is the native half of the
 * SAME route, with the same body: a typed message, up to three screenshots as
 * `data:image/…` URLs, and a `metadata` object the server caps at 12,000
 * characters (`webapp/app/api/feedback/route.ts#sanitizeMetadata`).
 *
 * Screenshots come from NP-059's media helpers (`lib/media/capture.ts`):
 * `captureImage("library")` already asks for the photo-library permission,
 * resizes to the web's JPEG parameters, and returns the `dataUrl` the feedback
 * route takes — no multipart upload, no blob URL. The route takes the data URL
 * and nothing else.
 *
 * Metadata is what a real iPhone arrives with: the app version and build (from
 * `expo-constants`, the same source the Settings screen prints), the OS and OS
 * version (from React Native's `Platform`), and the device model when the app
 * knows it (`expo-device` is optional — store builds include it, Jest does
 * not — so it is read through an injectable seam, never a hard import).
 *
 * Everything is injectable (fetch, base URL, metadata source, capture) for the
 * same reason `lib/account/deleteAccount.ts` is: these are network calls that
 * must be testable without a device.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  PLATE_PHOTO_RESIZE,
  captureImage,
  type CaptureDeps,
} from "@/lib/media/capture";
import { WEBAPP_BASE_URL } from "@/lib/config";

/** The three types the web offers, and the server allow-lists. */
export type FeedbackType = "bug" | "feature" | "general";

export const FEEDBACK_TYPES: readonly FeedbackType[] = [
  "bug",
  "feature",
  "general",
];

/** The web caps attachments at three (`FeedbackModal.tsx`, `route.ts`). */
export const MAX_FEEDBACK_IMAGES = 3;

/** The server's cap (`route.ts#sanitizeMetadata`): metadata JSON over this is dropped. */
export const FEEDBACK_METADATA_CAP = 12000;

/** The server's answer to an empty message (`route.ts`: 400 'Message is required'). */
export const FEEDBACK_MESSAGE_REQUIRED = "Message is required";

/** One screenshot, as NP-059's capture helper returns it. */
export interface FeedbackImage {
  name: string;
  dataUrl: string;
}

/** What a real phone arrives with: version, build, OS and device model. */
export interface FeedbackMetadata {
  appVersion: string;
  appBuild: string;
  platform: string;
  osVersion: string;
  deviceModel?: string;
  source: "native";
}

export interface DeviceInfo {
  /** e.g. "iPhone 16,2" / "Pixel 8". Absent when `expo-device` is unavailable. */
  modelName?: string | null;
  /** e.g. "iOS" / "Android". Defaults to React Native's `Platform.OS`. */
  platform?: string;
  /** e.g. "18.1". Defaults to React Native's `Platform.Version`. */
  osVersion?: string;
}

export interface AppInfo {
  version?: string;
  build?: string;
}

export interface FeedbackMetadataDeps {
  app?: AppInfo;
  device?: DeviceInfo;
}

export interface SendFeedbackInput {
  type: FeedbackType;
  message: string;
  images?: FeedbackImage[];
  metadata?: Record<string, unknown>;
  /** Session JWT. Absent → nothing is sent (`signed-out`, like uploads). */
  jwt?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  metadataDeps?: FeedbackMetadataDeps;
}

export type SendFeedbackResult =
  | { status: "sent" }
  | { status: "signed-out" }
  | { status: "validation-error"; message: string }
  | { status: "failed"; httpStatus?: number; message: string };

export interface PickFeedbackScreenshotDeps {
  capture?: typeof captureImage;
  captureDeps?: CaptureDeps;
  fileName?: string;
}

export type PickFeedbackScreenshotResult =
  | { status: "picked"; image: FeedbackImage }
  | { status: "cancelled" }
  | {
      status: "permission-denied";
      source: "camera" | "library";
      canAskAgain: boolean;
      message: string;
    }
  | { status: "failed"; message: string };

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  const impl = fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!impl) throw new Error("No fetch implementation available.");
  return impl;
}

function url(baseUrl: string | undefined, path: string): string {
  return `${(baseUrl ?? WEBAPP_BASE_URL).replace(/\/$/, "")}${path}`;
}

/**
 * The app version and build, from the same source the Settings screen prints
 * (`app/(app)/settings.tsx`): `expo-constants`. Injectable so tests do not
 * depend on the running build.
 */
export function getNativeAppInfo(deps?: FeedbackMetadataDeps): AppInfo {
  if (deps?.app) return deps.app;
  return {
    version: Constants.expoConfig?.version ?? "0.1.0",
    build:
      Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode?.toString() ??
      Constants.nativeBuildVersion ??
      "1",
  };
}

/**
 * The OS and device model. `expo-device` is an OPTIONAL dependency — store
 * builds include it, Jest does not — so the model travels through `deps` and
 * the OS falls back to React Native's `Platform`, which is always there.
 */
export function getNativeDeviceInfo(deps?: FeedbackMetadataDeps): DeviceInfo {
  if (deps?.device) return deps.device;
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version ?? "unknown"),
  };
}

/**
 * The metadata object every native feedback POST carries: app version, build,
 * OS and device model, tagged `source: "native"` so the team can tell it from
 * the web's. Callers may add keys via `extra`; the server drops metadata over
 * its 12,000-character cap, so this stays small on purpose.
 */
export function buildFeedbackMetadata(
  deps?: FeedbackMetadataDeps,
  extra?: Record<string, unknown>,
): FeedbackMetadata & Record<string, unknown> {
  const app = getNativeAppInfo(deps);
  const device = getNativeDeviceInfo(deps);
  const metadata: FeedbackMetadata & Record<string, unknown> = {
    appVersion: app.version ?? "0.1.0",
    appBuild: app.build ?? "1",
    platform: device.platform ?? Platform.OS,
    osVersion: device.osVersion ?? String(Platform.Version ?? "unknown"),
    source: "native",
    ...(extra ?? {}),
  };
  if (device.modelName) metadata.deviceModel = device.modelName;
  return metadata;
}

/**
 * True when the metadata would survive the server's cap. The server DROPS
 * oversized metadata (`{ truncated: true }`) rather than rejecting the POST,
 * so callers check this to keep the version and device facts attached.
 */
export function metadataFitsCap(metadata: unknown): boolean {
  try {
    return JSON.stringify(metadata).length <= FEEDBACK_METADATA_CAP;
  } catch {
    return false;
  }
}

/**
 * Pick one screenshot from the photo library through NP-059's media helpers.
 * The library — not the camera — because a feedback screenshot is a thing the
 * member already took, and the photo-library usage string (`app.json`
 * `NSPhotoLibraryUsageDescription`) already covers picking a photo to attach.
 */
export async function pickFeedbackScreenshot(
  deps: PickFeedbackScreenshotDeps = {},
): Promise<PickFeedbackScreenshotResult> {
  const capture = deps.capture ?? captureImage;
  const result = await capture("library", {
    spec: PLATE_PHOTO_RESIZE,
    ...(deps.captureDeps ? { deps: deps.captureDeps } : {}),
    ...(deps.fileName ? { fileName: deps.fileName } : {}),
  });
  if (result.status === "cancelled") return { status: "cancelled" };
  if (result.status === "permission-denied") return result;
  if (result.status === "failed") return result;
  return {
    status: "picked",
    image: {
      name: result.image.fileName,
      dataUrl: result.image.dataUrl,
    },
  };
}

/**
 * POST the web's feedback route with the native metadata attached. The body
 * matches `FeedbackModal.tsx` exactly (`type`, `message`, `images`,
 * `metadata`); images are capped at three the way both the web client and the
 * server cap them.
 */
export async function sendFeedback(
  input: SendFeedbackInput,
): Promise<SendFeedbackResult> {
  const jwt = input.jwt ?? null;
  if (!jwt) return { status: "signed-out" };

  const message = input.message?.trim() ?? "";
  if (!message) {
    return { status: "validation-error", message: FEEDBACK_MESSAGE_REQUIRED };
  }

  const images = (input.images ?? []).slice(0, MAX_FEEDBACK_IMAGES).filter(
    (img) =>
      typeof img.dataUrl === "string" && img.dataUrl.startsWith("data:image/"),
  );
  const metadata = {
    ...buildFeedbackMetadata(input.metadataDeps),
    ...(input.metadata ?? {}),
  };

  const fetchImpl = resolveFetch(input.fetchImpl);
  let res: Response;
  try {
    res = await fetchImpl(url(input.baseUrl, "/api/feedback"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        type: input.type,
        message,
        images,
        metadata,
      }),
    });
  } catch {
    return {
      status: "failed",
      message: "Could not send feedback. Check your connection and try again.",
    };
  }

  let body: { error?: unknown } | null = null;
  try {
    const text = await res.text();
    body = text.length > 0 ? (JSON.parse(text) as { error?: unknown }) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const serverMessage =
      body && typeof body.error === "string" && body.error.length > 0
        ? body.error
        : null;
    // An empty message shows the SERVER's 'Message is required', not a
    // client-side paraphrase: the client sends what it has and surfaces what
    // the server answers.
    if (res.status === 400 && serverMessage) {
      return { status: "validation-error", message: serverMessage };
    }
    return {
      status: "failed",
      httpStatus: res.status,
      message:
        serverMessage ?? "Could not send feedback. Try again in a moment.",
    };
  }

  return { status: "sent" };
}
