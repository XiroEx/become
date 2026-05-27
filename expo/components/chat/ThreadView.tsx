import { View, Text, ScrollView } from "react-native";
import {
  sortMessagesAsc,
  type ChatMessage,
} from "@/lib/chat/chatSelectors";

export interface ThreadViewProps {
  messages: ChatMessage[];
  testID?: string;
}

export function ThreadView({ messages, testID = "thread-view" }: ThreadViewProps) {
  const sorted = sortMessagesAsc(messages);
  if (sorted.length === 0) {
    return (
      <View testID={`${testID}-empty`} className="py-6 items-center">
        <Text className="text-muted-foreground">No messages yet. Say hi 👋</Text>
      </View>
    );
  }
  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{ padding: 16, gap: 8 }}
    >
      {sorted.map((m) => (
        <View
          key={m.id}
          testID={`${testID}-message-${m.id}`}
          className={`max-w-[80%] rounded-2xl px-3 py-2 ${
            m.sender === "user"
              ? "self-end bg-primary"
              : "self-start bg-card border border-border"
          }`}
        >
          <Text
            testID={`${testID}-message-${m.id}-text`}
            className={m.sender === "user" ? "text-primary-foreground" : "text-foreground"}
          >
            {m.text}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
