import { View, Text, Pressable } from "react-native";
import { UnreadBadge } from "@/components/chat/UnreadBadge";
import {
  sortConversationsByLastMessageDesc,
  type Conversation,
} from "@/lib/chat/chatSelectors";

export interface ConversationListProps {
  conversations: Conversation[];
  onSelectConversation?: (id: string) => void;
  testID?: string;
}

export function ConversationList({
  conversations,
  onSelectConversation,
  testID = "conversation-list",
}: ConversationListProps) {
  const sorted = sortConversationsByLastMessageDesc(conversations);
  if (sorted.length === 0) {
    return (
      <View testID={`${testID}-empty`} className="py-6">
        <Text className="text-muted-foreground text-center">
          No conversations yet.
        </Text>
      </View>
    );
  }
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {sorted.map((c) => (
        <Pressable
          key={c.id}
          testID={`${testID}-item-${c.id}`}
          onPress={() => onSelectConversation?.(c.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open conversation ${c.title}`}
          className="bg-card border border-border rounded-2xl p-3 flex-row items-center"
        >
          <View style={{ flex: 1 }}>
            <Text className="text-foreground font-semibold">{c.title}</Text>
            {c.lastMessage ? (
              <Text
                testID={`${testID}-last-${c.id}`}
                numberOfLines={1}
                className="text-muted-foreground text-sm"
              >
                {c.lastMessage}
              </Text>
            ) : null}
          </View>
          {c.unread > 0 ? (
            <UnreadBadge testID={`${testID}-unread-${c.id}`} count={c.unread} />
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
