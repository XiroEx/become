import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConversationList } from "@/components/chat/ConversationList";

export default function ChatIndexRoute() {
  const router = useRouter();
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="chat-index-route"
    >
      <View style={{ padding: 16 }}>
        <Text className="text-foreground text-2xl font-bold mb-3">Chat</Text>
        <ConversationList
          conversations={[]}
          onSelectConversation={(id) => router.push(`/(tabs)/chat/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}
