import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ConversationsResponseSchema,
  UnreadResponseSchema,
} from "@become/api-client";
import { ConversationList } from "@/components/chat/ConversationList";
import { UnreadBadge } from "@/components/chat/UnreadBadge";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toConversations } from "@/lib/chat/chatApi";

const UNREAD_POLL_MS = 30_000;

export interface ChatIndexRouteProps {
  /** Injected for tests; defaults to a 30s unread poll. */
  unreadPollMs?: number;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

export default function ChatIndexRoute({
  unreadPollMs = UNREAD_POLL_MS,
  setIntervalImpl,
  clearIntervalImpl,
}: ChatIndexRouteProps = {}) {
  const router = useRouter();
  const { token } = useAuth();

  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  };

  const convos = useFetch(
    "/api/chat/conversations",
    ConversationsResponseSchema,
    fetchOpts,
  );
  const unread = useFetch("/api/chat/unread", UnreadResponseSchema, fetchOpts);

  // Poll the unread count for the tab badge.
  const refetchUnread = unread.refetch;
  useEffect(() => {
    if (!token) return;
    const setI = setIntervalImpl ?? setInterval;
    const clearI = clearIntervalImpl ?? clearInterval;
    const handle = setI(() => {
      void refetchUnread();
    }, unreadPollMs);
    return () => clearI(handle);
  }, [token, unreadPollMs, setIntervalImpl, clearIntervalImpl, refetchUnread]);

  const conversations = toConversations(convos.data);
  const unreadCount = unread.data?.unreadCount ?? 0;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="chat-index-route"
    >
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Text className="text-foreground text-2xl font-bold">Chat</Text>
          <UnreadBadge testID="chat-unread-badge" count={unreadCount} />
        </View>
        <ConversationList
          conversations={conversations}
          onSelectConversation={(id) => router.push(`/(tabs)/chat/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}
