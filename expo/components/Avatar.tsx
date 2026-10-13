/**
 * The member's equipped profile icon, rendered consistently everywhere.
 * Ported from `webapp/components/Avatar.tsx`.
 *
 * Shows a custom uploaded photo when equipped, otherwise a preset glyph on its
 * branded gradient. A custom photo that fails to load falls back to a neutral
 * silhouette (MISSING_PHOTO) rather than a preset the member never picked.
 *
 * The gradient fill is `expo-linear-gradient` with stops from
 * `@become/core/profileIcons` — the same stops and angle (`to bottom right`)
 * as the web's `bg-gradient-to-br`. NativeWind cannot render gradient
 * classes, so a className fill would come out transparent (NP-214).
 */

import { useState } from "react";
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { UserRound } from "lucide-react-native";
import { profileIconGradient } from "@become/core/profileIcons";
import { AuthedImage } from "@/components/media/AuthedImage";
import {
  avatarImageSrc,
  equippedCustomAvatar,
  presetIcon,
} from "@/lib/profile/icons";
import { onDarkForeground } from "@/lib/theme/tokens";

export interface AvatarProps {
  /** PRESET_ICONS id, or 'custom' to use imageUrl. */
  icon?: string | null;
  /** Custom image URL (used when icon === 'custom'). */
  imageUrl?: string | null;
  /** Pixel size of the avatar (width and height). Defaults to 32. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Avatar({
  icon,
  imageUrl,
  size = 32,
  style,
  testID = "avatar",
}: AvatarProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  const src = avatarImageSrc(icon, imageUrl);
  const isCustom = equippedCustomAvatar(icon);

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: "hidden",
  };

  const imageStyle: ImageStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (src && src !== brokenSrc) {
    if (src.startsWith("/") || src.startsWith("file://")) {
      return (
        <View testID={testID} style={[containerStyle, style]}>
          <AuthedImage
            source={src}
            accessibilityLabel="Profile avatar"
            style={imageStyle}
            containerStyle={imageStyle}
            onStatus={(result) => {
              if (result.status === "failed" || result.status === "not-found" || result.status === "refused") {
                setBrokenSrc(src);
              }
            }}
          />
        </View>
      );
    }

    return (
      <View testID={testID} style={[containerStyle, style]}>
        <Image
          source={{ uri: src }}
          style={imageStyle}
          accessibilityRole="image"
          accessibilityLabel="Profile avatar"
          onError={() => setBrokenSrc(src)}
        />
      </View>
    );
  }

  if (isCustom) {
    // A member who equipped a photo that cannot be drawn gets the neutral silhouette.
    return (
      <View
        testID={testID}
        accessibilityRole="image"
        accessibilityLabel="Profile avatar"
        style={[
          containerStyle,
          {
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
        className="bg-zinc-500 dark:bg-zinc-600"
      >
        <UserRound
          color={onDarkForeground}
          size={size * 0.55}
          strokeWidth={2.25}
        />
      </View>
    );
  }

  const preset = presetIcon(icon);
  const Icon = preset.Icon;
  const gradient = profileIconGradient(preset.id);

  return (
    <LinearGradient
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`${preset.label} avatar`}
      colors={gradient.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        containerStyle,
        {
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Icon
        color={onDarkForeground}
        size={size * 0.55}
        strokeWidth={2.25}
      />
    </LinearGradient>
  );
}

export default Avatar;
