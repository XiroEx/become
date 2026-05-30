import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  apiFetch,
  MessagesResponseSchema,
  PostMessageResponseSchema,
} from "@become/api-client";
import { ThreadView } from "@/components/chat/ThreadView";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { type ChatMessage } from "@/lib/chat/chatSelectors";
import { toChatMessage, toChatMessages } from "@/lib/chat/chatApi";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";

export default function ChatThreadRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = typeof params.id === "string" ? params.id : "";
  const { token, user } = useAuth();
  const currentUserId = user?._id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  // Monotonic counter for optimistic ids (avoids Date.now() and collisions).
  const tmpRef = useRef(0);

  const messagesPath = conversationId
    ? `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`
    : null;

  const history = useFetch(messagesPath, MessagesResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token || !conversationId,
  });

  // Seed the thread from the fetched history.
  useEffect(() => {
    if (history.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(toChatMessages(history.data, currentUserId));
    }
  }, [history.data, currentUserId]);

  const handleSend = useCallback(
    async (text: string): Promise<void> => {
      if (!messagesPath) return;
      const tmpId = `tmp-${(tmpRef.current += 1)}`;
      const optimistic: ChatMessage = {
        id: tmpId,
        text,
        sender: "user",
        sentAt: "",
      };
      setMessages((prev) => [...prev, optimistic]);
      setSending(true);
      try {
        const res = await apiFetch(messagesPath, PostMessageResponseSchema, {
          method: "POST",
          body: { text },
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        // Wrapped { message } → replace the optimistic placeholder with the real one.
        const real = toChatMessage(res.message, currentUserId);
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? real : m)));
      } catch {
        // Roll back the optimistic message on failure.
        setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      } finally {
        setSending(false);
      }
    },
    [messagesPath, token, currentUserId],
  );

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
        <MessageComposer onSend={handleSend} sending={sending} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
