import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThreadView } from "@/components/chat/ThreadView";
import { MessageComposer } from "@/components/chat/MessageComposer";
import {
  type ChatMessage,
  unwrapPostedMessage,
} from "@/lib/chat/chatSelectors";

export default function ChatThreadRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = typeof params.id === "string" ? params.id : "";
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  if (!conversationId) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing conversation id</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSend = async (text: string): Promise<void> => {
    // Optimistic append, then call real /api/chat endpoint in a follow-up.
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      text,
      sender: "user",
      sentAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    // When the real endpoint is wired, replace `optimistic` via:
    // const real = unwrapPostedMessage(serverResponse);
    // if (real) setMessages(prev => prev.map(m => m.id === optimistic.id ? real : m));
    void unwrapPostedMessage; // referenced so the import isn't pruned
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="chat-thread-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <ThreadView messages={messages} />
        </View>
        <MessageComposer onSend={handleSend} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
