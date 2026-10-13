import { ActivityIndicator, Pressable, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { CreditCard } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { MANAGE_BILLING_LABEL, MANAGE_BILLING_PORTAL_NOTE } from "@become/core";
import type { PortalState } from "@/lib/entitlements/billing";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";

export interface ManageBillingButtonProps {
  state: PortalState;
  onOpenPortal: () => void;
  showNote?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ManageBillingButton({
  state,
  onOpenPortal,
  showNote = false,
  className,
  style,
  testID = "manage-billing",
}: ManageBillingButtonProps) {
  const { colors } = useThemeTokens();
  const opening = state === "opening";

  return (
    <View className={className} style={style} accessibilityLiveRegion="polite">
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={MANAGE_BILLING_LABEL}
        disabled={opening}
        onPress={onOpenPortal}
        style={[
          minTouchTarget,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            opacity: opening ? 0.6 : 1,
          },
        ]}
      >
        {opening ? (
          <ActivityIndicator size="small" color={colors.foreground} />
        ) : (
          <CreditCard size={16} color={colors.foreground} />
        )}
        <Text
          className="text-foreground text-sm font-semibold"
          style={WRAPPABLE_TEXT}
        >
          {MANAGE_BILLING_LABEL}
        </Text>
      </Pressable>
      {showNote && (
        <Text
          testID={`${testID}-note`}
          className="text-muted-foreground text-xs leading-snug mt-2"
          style={WRAPPABLE_TEXT}
        >
          {MANAGE_BILLING_PORTAL_NOTE}
        </Text>
      )}
      {state === "failed" && (
        <Text
          testID={`${testID}-failed`}
          className="text-muted-foreground text-xs font-medium mt-2"
          style={WRAPPABLE_TEXT}
        >
          {"Billing didn't open just now. Try that again in a moment."}
        </Text>
      )}
    </View>
  );
}

export default ManageBillingButton;
