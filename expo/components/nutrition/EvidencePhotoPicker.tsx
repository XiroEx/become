import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Camera, ImagePlus, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { AuthedImage } from "@/components/media/AuthedImage";
import { PermissionDeniedNotice } from "@/components/media/PermissionDeniedNotice";
import {
  captureImage,
  type CaptureSource,
  type PermissionDeniedCapture,
} from "@/lib/media/capture";
import {
  uploadFoodFlagImage,
  type UploadableImage,
  type UploadResult,
} from "@/lib/media/upload";
import { MAX_FLAG_PHOTOS } from "@/lib/nutrition/foodFlags";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Multi-photo capture for a food report, natively (NP-174).
 *
 * The web's `EvidencePhotoPicker.tsx`: one frame rarely carries both the
 * barcode and the nutrition panel, and the reviewer needs both — the barcode
 * says WHICH product, the panel says what is actually printed on it. Photos
 * upload ahead of the report through NP-059's capture + upload helpers
 * (`POST /api/nutrition/flags/image`) so the flag carries a durable
 * same-origin URL rather than a local URI that dies with the sheet.
 *
 * Controlled: the parent owns the uploaded URLs, this owns capture/upload.
 */

export interface EvidencePhotoPickerProps {
  photos: string[];
  onChange: (next: string[]) => void;
  onError?: (message: string | null) => void;
  /** Emphasise the barcode+panel ask. Used on the second-chance flow. */
  emphatic?: boolean;
  disabled?: boolean;
  captureImpl?: typeof captureImage;
  uploadImpl?: (image: UploadableImage) => Promise<UploadResult>;
  /** Thumbnail renderer. Defaults to `AuthedImage` (per-member blob URLs need the session). */
  thumbImpl?: (url: string, index: number) => ReactNode;
  /**
   * The library-pick button's label. Defaults to "Choose photo"; the flag
   * sheet (NP-275) renames it to "Upload photo" to match the web's wording
   * — every other caller keeps the default.
   */
  choosePhotoLabel?: string;
  testID?: string;
}

export function EvidencePhotoPicker({
  photos,
  onChange,
  onError,
  emphatic = false,
  disabled = false,
  captureImpl = captureImage,
  uploadImpl = uploadFoodFlagImage,
  thumbImpl,
  choosePhotoLabel = "Choose photo",
  testID = "evidence-photos",
}: EvidencePhotoPickerProps) {
  const { colors } = useThemeTokens();
  const [uploading, setUploading] = useState(false);
  const [denial, setDenial] = useState<PermissionDeniedCapture | null>(null);
  const atLimit = photos.length >= MAX_FLAG_PHOTOS;
  const busy = uploading || disabled;

  async function addFrom(source: CaptureSource) {
    if (busy || atLimit) return;
    setDenial(null);
    onError?.(null);
    let result: Awaited<ReturnType<typeof captureImage>>;
    try {
      result = await captureImpl(source);
    } catch {
      onError?.("Become could not get that photo. Try again in a moment.");
      return;
    }
    if (result.status === "cancelled") return;
    if (result.status === "permission-denied") {
      setDenial(result);
      return;
    }
    if (result.status === "failed") {
      onError?.(result.message);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadImpl(result.image);
      if (uploaded.status === "uploaded") {
        onChange([...photos, uploaded.imageUrl].slice(0, MAX_FLAG_PHOTOS));
      } else if (uploaded.status === "signed-out") {
        onError?.("Please sign in to upload a photo.");
      } else {
        onError?.(uploaded.message);
      }
    } catch {
      onError?.("Could not upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <View testID={testID}>
      <View
        testID={`${testID}-explainer`}
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: emphatic ? colors.accent : colors.border,
          backgroundColor: emphatic ? colors.muted : colors.muted,
          padding: 12,
        }}
      >
        <Text className="text-foreground text-xs font-semibold">
          {emphatic
            ? "One photo with the barcode AND the panel is worth ten without"
            : "Add photos of the package"}
        </Text>
        <Text className="text-muted-foreground text-[11px] mt-1">
          The barcode proves which product it is. The nutrition panel proves
          what is printed on it. Without both we cannot tell a wrong number
          from a different product.
        </Text>

        {photos.length > 0 ? (
          <View
            testID={`${testID}-grid`}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {photos.map((url, i) => (
              <View
                key={`${url}-${i}`}
                testID={`${testID}-thumb-${i}`}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 8,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                {thumbImpl ? (
                  thumbImpl(url, i)
                ) : (
                  <AuthedImage
                    source={url}
                    accessibilityLabel={`Evidence photo ${i + 1}`}
                    style={{ width: 88, height: 88 }}
                    testID={`${testID}-image-${i}`}
                  />
                )}
                <Pressable
                  testID={`${testID}-remove-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  onPress={() => onChange(photos.filter((p) => p !== url))}
                  disabled={disabled}
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    borderRadius: 12,
                    backgroundColor: colors.foreground,
                    padding: 4,
                    opacity: 0.6,
                  }}
                >
                  <X size={12} color={colors.background} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Pressable
            testID={`${testID}-take-photo`}
            accessibilityRole="button"
            accessibilityLabel="Take a photo of the package"
            onPress={() => void addFrom("camera")}
            disabled={busy || atLimit}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingVertical: 10,
              opacity: busy || atLimit ? 0.5 : 1,
            }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Camera size={16} color={colors.foreground} />
            )}
            <Text className="text-foreground text-xs font-semibold">
              {uploading ? "Uploading…" : "Take photo"}
            </Text>
          </Pressable>
          <Pressable
            testID={`${testID}-choose-photo`}
            accessibilityRole="button"
            accessibilityLabel="Choose a photo from the library"
            onPress={() => void addFrom("library")}
            disabled={busy || atLimit}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingVertical: 10,
              opacity: busy || atLimit ? 0.5 : 1,
            }}
          >
            <ImagePlus size={16} color={colors.foreground} />
            <Text className="text-foreground text-xs font-semibold">
              {choosePhotoLabel}
            </Text>
          </Pressable>
        </View>
        {atLimit ? (
          <Text
            testID={`${testID}-limit`}
            className="text-muted-foreground text-[11px] mt-2"
          >
            {photos.length} of {MAX_FLAG_PHOTOS} photos attached.
          </Text>
        ) : null}
      </View>

      {denial ? (
        <View style={{ marginTop: 8 }}>
          <PermissionDeniedNotice
            denial={denial}
            testID={`${testID}-permission-denied`}
          />
        </View>
      ) : null}
    </View>
  );
}
