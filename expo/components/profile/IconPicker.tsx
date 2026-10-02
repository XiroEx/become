/**
 * Self-contained profile-icon chooser.
 * Ported from `webapp/components/profile/IconPicker.tsx`.
 *
 * Shows the current avatar preview, then a grid of preset icons; tapping one
 * saves it optimistically via PATCH /api/profile { profileIcon }.
 *
 * Custom photo upload routes through NP-059's `captureImage('library')` and
 * `uploadAvatarImage` (`POST /api/profile/avatar`).
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Check, Upload } from "lucide-react-native";
import {
  apiFetch,
  ProfileResponseSchema,
  type ProfileResponse,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Avatar } from "@/components/Avatar";
import { PermissionDeniedNotice } from "@/components/media/PermissionDeniedNotice";
import {
  AVATAR_PHOTO_RESIZE,
  captureImage,
  type PermissionDeniedCapture,
} from "@/lib/media/capture";
import { uploadAvatarImage } from "@/lib/media/upload";
import { PRESET_ICONS } from "@/lib/profile/icons";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface IconPickerProps {
  currentIcon?: string | null;
  avatarUrl?: string | null;
  onIconChange?: (icon: string) => void;
  onAvatarChange?: (avatarUrl: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconPicker({
  currentIcon,
  avatarUrl,
  onIconChange,
  onAvatarChange,
  style,
  testID = "profile-icon-picker",
}: IconPickerProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [pickedIcon, setPickedIcon] = useState<string | null>(null);
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denial, setDenial] = useState<PermissionDeniedCapture | null>(null);

  const current = pickedIcon ?? currentIcon ?? null;
  const avatar = uploadedAvatar ?? avatarUrl ?? null;

  async function pick(id: string) {
    if (id === current || saving) return;
    const prev = current;
    setPickedIcon(id); // optimistic
    setSaving(id);
    setError(null);

    try {
      await apiFetch<ProfileResponse>("/api/profile", ProfileResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ profileIcon: id }),
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
      });
      onIconChange?.(id);
    } catch {
      setPickedIcon(prev); // revert on failure
      setError("Could not update profile icon. Try again.");
    } finally {
      setSaving(null);
    }
  }

  async function handlePickCustom() {
    if (uploading) return;
    setError(null);
    setDenial(null);

    const captureResult = await captureImage("library", {
      spec: AVATAR_PHOTO_RESIZE,
    });

    if (captureResult.status === "cancelled") {
      return;
    }

    if (captureResult.status === "permission-denied") {
      setDenial(captureResult);
      return;
    }

    if (captureResult.status === "failed") {
      setError(captureResult.message);
      return;
    }

    if (captureResult.status === "captured") {
      setUploading(true);
      try {
        const uploadResult = await uploadAvatarImage(captureResult.image);
        if (uploadResult.status === "uploaded") {
          setUploadedAvatar(uploadResult.imageUrl);
          setPickedIcon("custom");
          onAvatarChange?.(uploadResult.imageUrl);
          onIconChange?.("custom");
        } else if (uploadResult.status === "signed-out") {
          setError("Please sign in to upload an avatar.");
        } else {
          setError(uploadResult.message || "Upload failed. Try again.");
        }
      } catch {
        setError("Upload failed. Try again.");
      } finally {
        setUploading(false);
      }
    }
  }

  return (
    <View
      testID={testID}
      style={style}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <View className="flex-row items-center gap-4">
        <Avatar
          icon={current}
          imageUrl={avatar}
          size={56}
          testID="icon-picker-preview"
        />
        <View className="flex-1">
          <Text className="text-foreground text-sm font-semibold">
            Profile icon
          </Text>
          <Text className="text-muted-foreground text-xs">
            Pick one that feels like you.
          </Text>
        </View>
      </View>

      <View className="mt-5 flex-row flex-wrap gap-3">
        {PRESET_ICONS.map((p) => {
          const selected = current === p.id;
          return (
            <Pressable
              key={p.id}
              testID={`icon-preset-${p.id}`}
              accessibilityRole="button"
              accessibilityLabel={p.label}
              accessibilityState={{ selected }}
              onPress={() => pick(p.id)}
              disabled={Boolean(saving)}
              style={[
                minTouchTarget,
                {
                  width: 52,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 26,
                  borderWidth: selected ? 2 : 0,
                  borderColor: selected ? colors.foreground : "transparent",
                },
              ]}
            >
              <Avatar icon={p.id} size={44} />
              {selected ? (
                <View
                  testID={`icon-preset-${p.id}-check`}
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: colors.foreground,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check
                    size={12}
                    color={colors.background}
                    strokeWidth={3}
                  />
                </View>
              ) : null}
            </Pressable>
          );
        })}

        {/* Custom photo upload button */}
        <Pressable
          testID="icon-upload-custom"
          accessibilityRole="button"
          accessibilityLabel="Upload a custom photo"
          accessibilityState={{ selected: current === "custom" }}
          onPress={handlePickCustom}
          disabled={uploading}
          style={[
            minTouchTarget,
            {
              width: 52,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 26,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor:
                current === "custom"
                  ? colors.foreground
                  : colors.border,
            },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : current === "custom" && avatar ? (
            <Avatar icon="custom" imageUrl={avatar} size={44} />
          ) : (
            <Upload size={20} color={colors["muted-foreground"]} />
          )}
        </Pressable>
      </View>

      {error ? (
        <Text
          testID="icon-picker-error"
          accessibilityRole="alert"
          className="text-destructive mt-3 text-xs"
        >
          {error}
        </Text>
      ) : null}

      <Text className="text-muted-foreground mt-3 text-xs">
        Or upload your own — choose a photo from your library.
      </Text>

      {denial ? (
        <View className="mt-3">
          <PermissionDeniedNotice
            denial={denial}
            onOpened={() => setDenial(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

export default IconPicker;
