import { View, Text } from "react-native";

export interface UnreadBadgeProps {
  count: number;
  testID?: string;
}

export function UnreadBadge({ count, testID = "unread-badge" }: UnreadBadgeProps) {
  if (!Number.isFinite(count) || count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`${count} unread`}
      className="bg-primary rounded-full px-2 py-0.5 min-w-[20px] items-center justify-center"
    >
      <Text className="text-primary-foreground text-xs font-bold">
        {display}
      </Text>
    </View>
  );
}
