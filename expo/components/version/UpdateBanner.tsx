import { View, Pressable } from "react-native";
import { X } from "lucide-react-native";
import { Text } from "@/components/Text";

export interface UpdateBannerProps {
  latestVersion: string;
  storeUrl?: string;
  onUpdate?: () => void;
  onDismiss: () => void;
  testID?: string;
}

export function UpdateBanner({
  latestVersion,
  storeUrl,
  onUpdate,
  onDismiss,
  testID = "update-banner",
}: UpdateBannerProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="bg-card border-b border-border px-4 py-2.5 flex-row items-center justify-between"
    >
      <View className="flex-1 mr-3">
        <Text
          testID={`${testID}-title`}
          className="text-foreground text-xs font-semibold"
        >
          Update available
        </Text>
        <Text
          testID={`${testID}-message`}
          className="text-muted-foreground text-[11px]"
        >
          {`Become v${latestVersion} is available.`}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {storeUrl && (
          <Pressable
            testID={`${testID}-update-btn`}
            onPress={onUpdate}
            className="bg-primary px-3 py-1 rounded"
            accessibilityRole="button"
            accessibilityLabel="Update Become in app store"
          >
            <Text className="text-primary-foreground text-xs font-semibold">
              Update
            </Text>
          </Pressable>
        )}
        <Pressable
          testID={`${testID}-dismiss-btn`}
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notification"
        >
          <X size={16} className="text-muted-foreground" />
        </Pressable>
      </View>
    </View>
  );
}
