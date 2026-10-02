/**
 * ONE place native takes a photo, picks one, and resizes it (NP-059).
 *
 * WHY THE NUMBERS ARE THE WEB'S. The web captures with a file input and puts
 * every image through `webapp/lib/imageResize.ts#resizeImageToBlob` before it
 * uploads or shows it to a model: the LONG edge is capped and the result is
 * re-encoded as JPEG. The plate scan, the food-report label photo and the
 * evidence picker all pass `{ maxDim: 1024, quality: 0.6 }`
 * (`webapp/app/dashboard/nutrition/page.tsx`,
 * `webapp/components/nutrition/SnapPlateModal.tsx`, `FlagFoodSheet.tsx`,
 * `EvidencePhotoPicker.tsx`); the meal photo passes
 * `{ maxDim: 1600, quality: 0.82 }` (`webapp/components/meals/MealForm.tsx`).
 *
 * Those are AI-priced images. A vision call is billed against the member's
 * allowance, and a native client that sent a 12-megapixel original would be
 * spending that allowance on a different — bigger — picture than the web
 * spends it on, for the same tap. So the numbers live here as named constants,
 * and `targetSize` reproduces the web's branch exactly: cap `max(w, h)`, scale
 * the other edge by the same ratio, never enlarge.
 *
 * WHAT COMES BACK. Both a file URI (what a multipart upload sends — see
 * `lib/media/upload.ts`) and a `data:image/jpeg;base64,…` URL, because the AI
 * routes take the data URL and nothing else (`webapp/lib/blobToBase64.ts`).
 *
 * PERMISSION IS AN OUTCOME, NOT AN EXCEPTION. A refusal is a normal answer a
 * member gives, so it comes back as `status: "permission-denied"` carrying the
 * sentence to show and whether iOS/Android will ask again — never as a throw.
 * `components/media/PermissionDeniedNotice.tsx` renders it with the way to
 * Settings.
 */

import { Linking } from "react-native";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Where an image comes from: the camera, or the library already on the phone. */
export type CaptureSource = "camera" | "library";

/** The two numbers the web resizes with: a long-edge cap and a JPEG quality. */
export interface ResizeSpec {
  /** Long-edge cap in pixels. Never enlarges. */
  maxDim: number;
  /** JPEG quality, 0..1. */
  quality: number;
}

/**
 * The default, and the one the AI routes are priced against: the web's plate
 * scan, food-report and evidence-photo parameters.
 */
export const PLATE_PHOTO_RESIZE: ResizeSpec = { maxDim: 1024, quality: 0.6 };

/**
 * The web's meal / recipe photo parameters (`MealForm.tsx`). Not the default —
 * pass it explicitly from the meal and recipe screens (NP-143, NP-144).
 */
export const MEAL_PHOTO_RESIZE: ResizeSpec = { maxDim: 1600, quality: 0.82 };

/**
 * Avatar photo parameters (512 / 0.85). Matches web's `AvatarCropModal.tsx` output
 * and profile avatar upload (NP-163).
 */
export const AVATAR_PHOTO_RESIZE: ResizeSpec = { maxDim: 512, quality: 0.85 };

/** Everything this module produces is a JPEG. The upload routes allow-list it. */
export const CAPTURE_MIME_TYPE = "image/jpeg";

/** Default multipart filename. The server derives the extension from the type. */
export const CAPTURE_FILE_NAME = "photo.jpg";

/** A resized JPEG, ready to upload and ready to show a model. */
export interface CapturedImage {
  /** `file://…` on the cache directory — what a multipart upload sends. */
  uri: string;
  width: number;
  height: number;
  /** `data:image/jpeg;base64,…` — what the AI routes take. */
  dataUrl: string;
  mimeType: typeof CAPTURE_MIME_TYPE;
  fileName: string;
}

export type CaptureResult =
  | { status: "captured"; image: CapturedImage }
  /** The member backed out of the camera or the picker. Say nothing. */
  | { status: "cancelled" }
  | {
      status: "permission-denied";
      source: CaptureSource;
      /** False once the OS has stopped asking — only Settings can change it. */
      canAskAgain: boolean;
      /** What to show. Already written in Become's voice. */
      message: string;
    }
  /** The camera, the picker or the encoder failed. Never a crash. */
  | { status: "failed"; message: string };

/** The refusal, on its own — what `PermissionDeniedNotice` renders. */
export type PermissionDeniedCapture = Extract<
  CaptureResult,
  { status: "permission-denied" }
>;

/** Granted, and whether the OS will ask again if it was not. */
export interface PermissionOutcome {
  granted: boolean;
  canAskAgain: boolean;
}

/** The part of an `ImagePickerAsset` this module uses. */
export interface PickedAsset {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
}

export interface ResizeRequest {
  uri: string;
  /** The asset's own dimensions, as the picker reported them. */
  width: number;
  height: number;
  spec: ResizeSpec;
}

export interface ResizedImage {
  uri: string;
  width: number;
  height: number;
  /** Bare base64, no `data:` prefix — this module adds it. */
  base64: string;
}

/**
 * Every native edge, injectable. Tests drive these; the app leaves them unset
 * and gets expo-camera, expo-image-picker and expo-image-manipulator.
 */
export interface CaptureDeps {
  requestPermission?: (source: CaptureSource) => Promise<PermissionOutcome>;
  /** Resolves `null` when the member cancelled. */
  launch?: (source: CaptureSource) => Promise<PickedAsset | null>;
  resize?: (request: ResizeRequest) => Promise<ResizedImage>;
}

export interface CaptureOptions {
  /** Defaults to `PLATE_PHOTO_RESIZE` — the web's 1024 / 0.6. */
  spec?: ResizeSpec;
  /** Multipart filename. Defaults to `photo.jpg`. */
  fileName?: string;
  deps?: CaptureDeps;
}

const FAILED_MESSAGE =
  "Become could not get that photo. Try again in a moment.";

/** The button beside every permission message. */
export const SETTINGS_ACTION_LABEL = "Open Settings";

/**
 * What a member sees when they say no — or said no once already, which is the
 * case that needs Settings because the OS will not ask a second time.
 */
export function permissionDeniedMessage(
  source: CaptureSource,
  canAskAgain: boolean,
): string {
  if (source === "camera") {
    return canAskAgain
      ? "Become needs your camera to take that photo. Allow camera access and try again — you can change it any time in Settings."
      : "Camera access is off for Become, so there is nothing to take the photo with. Turn Camera on in Settings, then try again.";
  }
  return canAskAgain
    ? "Become needs access to your photos to use one here. Allow access and try again — you can change it any time in Settings."
    : "Photo access is off for Become. Turn Photos on in Settings, then choose the photo again.";
}

/**
 * Open this app's page in the system Settings. Never throws: the message is
 * already on screen and a failed deep link must not take the screen with it.
 * Returns whether Settings actually opened.
 */
export async function openAppSettings(
  deps: { openSettings?: () => Promise<void> } = {},
): Promise<boolean> {
  const open = deps.openSettings ?? (() => Linking.openSettings());
  try {
    await open();
    return true;
  } catch {
    return false;
  }
}

/** A picker can answer 0 for a dimension; 0 is not a size to divide by. */
function hasUsableSize(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

/**
 * The web's branch, verbatim (`resizeImageToBlob`): nothing happens below the
 * cap, and above it the LONG edge becomes `maxDim` while the other edge is
 * scaled by the same ratio. One dimension is passed to the manipulator, which
 * derives the other — so the ratio is the decoder's arithmetic, not ours.
 */
export function targetSize(
  width: number,
  height: number,
  maxDim: number,
): { width: number } | { height: number } | null {
  if (!hasUsableSize(width, height)) return null;
  if (Math.max(width, height) <= maxDim) return null;
  return width >= height ? { width: maxDim } : { height: maxDim };
}

async function defaultRequestPermission(
  source: CaptureSource,
): Promise<PermissionOutcome> {
  // The CAMERA permission is asked through expo-camera because that is the
  // module every in-app camera surface will use (the barcode scanner, NP-088;
  // the Mind mirror, NP-100). It is the same OS permission the picker's camera
  // needs, so asking here means the picker never has to ask again.
  const response =
    source === "camera"
      ? await Camera.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  return { granted: response.granted, canAskAgain: response.canAskAgain };
}

async function defaultLaunch(
  source: CaptureSource,
): Promise<PickedAsset | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    // Full quality out of the picker on purpose: the ONE compression this app
    // does is the web's, below. Compressing twice shows.
    quality: 1,
    exif: false,
    base64: false,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? null,
  };
}

async function defaultResize(request: ResizeRequest): Promise<ResizedImage> {
  const context = ImageManipulator.manipulate(request.uri);
  let width = request.width;
  let height = request.height;
  if (!hasUsableSize(width, height)) {
    // The picker always reports the asset's size; an Android ContentProvider
    // that answers 0 would leave us capping blind, so ask the decoder itself
    // which edge is the long one rather than guess and enlarge a portrait.
    const probe = await context.renderAsync();
    width = probe.width;
    height = probe.height;
  }
  const size = targetSize(width, height, request.spec.maxDim);
  if (size) context.resize(size);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: request.spec.quality,
    base64: true,
  });
  context.release();
  rendered.release();
  if (!saved.base64) {
    throw new Error("expo-image-manipulator returned no base64");
  }
  return {
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    base64: saved.base64,
  };
}

/**
 * Take a photo or pick one, then resize it with the web's parameters.
 * Resolves — it never rejects — with what happened.
 */
export async function captureImage(
  source: CaptureSource,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const deps = options.deps ?? {};
  const spec = options.spec ?? PLATE_PHOTO_RESIZE;
  const requestPermission = deps.requestPermission ?? defaultRequestPermission;
  const launch = deps.launch ?? defaultLaunch;
  const resize = deps.resize ?? defaultResize;

  let permission: PermissionOutcome;
  try {
    permission = await requestPermission(source);
  } catch {
    return { status: "failed", message: FAILED_MESSAGE };
  }
  if (!permission.granted) {
    return {
      status: "permission-denied",
      source,
      canAskAgain: permission.canAskAgain,
      message: permissionDeniedMessage(source, permission.canAskAgain),
    };
  }

  let asset: PickedAsset | null;
  try {
    asset = await launch(source);
  } catch {
    return { status: "failed", message: FAILED_MESSAGE };
  }
  if (!asset) return { status: "cancelled" };

  try {
    const resized = await resize({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      spec,
    });
    return {
      status: "captured",
      image: {
        uri: resized.uri,
        width: resized.width,
        height: resized.height,
        dataUrl: `data:${CAPTURE_MIME_TYPE};base64,${resized.base64}`,
        mimeType: CAPTURE_MIME_TYPE,
        fileName: options.fileName ?? CAPTURE_FILE_NAME,
      },
    };
  } catch {
    return { status: "failed", message: FAILED_MESSAGE };
  }
}

/** Take a photo with the camera. */
export function takePhoto(options: CaptureOptions = {}): Promise<CaptureResult> {
  return captureImage("camera", options);
}

/** Pick a photo already on the phone. */
export function pickPhoto(options: CaptureOptions = {}): Promise<CaptureResult> {
  return captureImage("library", options);
}
