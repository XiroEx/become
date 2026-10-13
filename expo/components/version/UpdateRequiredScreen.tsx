import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { openStore, type VersionGateDeps } from "@/lib/version/versionGate";

export interface UpdateRequiredScreenProps {
  storeUrl?: string;
  deps?: VersionGateDeps;
  onOpenStore?: () => void;
  testID?: string;
}

export function UpdateRequiredScreen({
  storeUrl,
  deps,
  onOpenStore,
  testID = "update-required-screen",
}: UpdateRequiredScreenProps) {
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    if (onOpenStore) {
      onOpenStore();
    } else {
      void openStore(storeUrl, deps);
    }
  };

  return (
    <View
      testID={testID}
      className="flex-1 bg-background justify-center items-center px-6"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left + 24,
        paddingRight: insets.right + 24,
      }}
    >
      <View className="max-w-sm w-full items-center">
        <Text
          testID={`${testID}-title`}
          className="text-2xl font-bold text-foreground text-center mb-3"
          accessibilityRole="header"
        >
          Update Become
        </Text>
        <Text
          testID={`${testID}-message`}
          className="text-muted-foreground text-sm text-center mb-8"
        >
          A new version of Become is required to continue. Please update to the latest version.
        </Text>
        <Button
          testID={`${testID}-button`}
          variant="primary"
          size="lg"
          onPress={handlePress}
          disabled={!storeUrl}
          accessibilityLabel="Update Become in app store"
        >
          Update Become
        </Button>
      </View>
    </View>
  );
}
