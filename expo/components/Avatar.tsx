/**
 * The member's equipped profile icon, rendered consistently everywhere.
 * Ported from `webapp/components/Avatar.tsx`.
 *
 * Shows a custom uploaded photo when equipped, otherwise a preset glyph on its
 * branded color. A custom photo that fails to load falls back to a neutral
 * silhouette (MISSING_PHOTO) rather than a preset the member never picked.
 */

import { useState } from "react";
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { UserRound } from "lucide-react-native";
import { AuthedImage } from "@/components/media/AuthedImage";
import {
  avatarImageSrc,
  equippedCustomAvatar,
  presetIcon,
} from "@/lib/profile/icons";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

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
  const { colors } = useThemeTokens();
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
          color={colors["primary-foreground"]}
          size={size * 0.55}
          strokeWidth={2.25}
        />
      </View>
    );
  }

  const preset = presetIcon(icon);
  const Icon = preset.Icon;

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`${preset.label} avatar`}
      style={[
        containerStyle,
        {
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
      className={preset.bgClass}
    >
      <Icon
        color={colors["primary-foreground"]}
        size={size * 0.55}
        strokeWidth={2.25}
      />
    </View>
  );
}

export default Avatar;
