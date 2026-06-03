"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, MessageCircle, ImagePlus, Loader2 } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import FeatureGuard from "@/components/FeatureGuard";
import GifPicker from "@/components/chat/GifPicker";

interface Participant {
  _id: string;
  name: string;
  email: string;
  role?: string;
}

interface ConversationData {
  _id: string;
  type: string;
  participants: Participant[];
  name?: string;
  lastMessage?: {
    text: string;
    senderId: string;
    sentAt: string;
  };
  unreadCount: number;
  updatedAt: string;
}

interface MessageData {
  _id: string;
  conversationId: string;
  senderId: { _id: string; name: string; email: string } | string;
  text: string;
  imageUrl?: string;
  readBy: string[];
  createdAt: string;
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatMessageDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("user");
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "instant",
      });
    }
  }, []);

  // Fetch current user info
  useEffect(() => {
    async function fetchMe() {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data.user._id);
          setUserRole(data.user.role || "user");
          setTrainerId(data.user.trainerId || null);
        }
      } catch (err) {
        console.error("Error fetching user:", err);
      }
    }
    fetchMe();
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/chat/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        return data.conversations || [];
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    }
    return [];
  }, []);

  // Initial load: fetch conversations and auto-create trainer chat if needed
  useEffect(() => {
    if (!currentUserId) return;

    async function init() {
      setLoading(true);
      const convs = await fetchConversations();

      // If no conversations and user has a trainer, auto-create one
      if (convs.length === 0 && trainerId) {
        const token = getToken();
        if (token) {
          try {
            const res = await fetch("/api/chat/conversations", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ participantId: trainerId }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.conversation) {
                setConversations([data.conversation]);
                setSelectedConversation(data.conversation);
              }
            }
          } catch (err) {
            console.error("Error creating trainer conversation:", err);
          }
        }
      }
      setLoading(false);
    }
    init();
  }, [currentUserId, trainerId, fetchConversations]);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(
    async (convId: string) => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(
          `/api/chat/conversations/${convId}/messages`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          // Update unread count for this conversation
          setConversations((prev) =>
            prev.map((c) =>
              c._id === convId ? { ...c, unreadCount: 0 } : c
            )
          );
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    },
    []
  );

  // When conversation is selected, load messages
  useEffect(() => {
    if (!selectedConversation) return;

    setLoadingMessages(true);
    fetchMessages(selectedConversation._id).then(() => {
      setLoadingMessages(false);
      setTimeout(() => scrollToBottom(false), 100);
    });

    // Focus input
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [selectedConversation, fetchMessages, scrollToBottom]);

  // Poll for new messages every 3 seconds
  useEffect(() => {
    if (!selectedConversation) return;

    pollRef.current = setInterval(() => {
      fetchMessages(selectedConversation._id);
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedConversation, fetchMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // POST a message (text and/or image) and reconcile local state.
  const postMessage = async (payload: { text?: string; imageUrl?: string }): Promise<boolean> => {
    if (!selectedConversation) return false;
    const token = getToken();
    if (!token) return false;
    const res = await fetch(
      `/api/chat/conversations/${selectedConversation._id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    setMessages((prev) => [...prev, data.message]);
    const preview = payload.text?.trim() ? payload.text.trim().substring(0, 100) : "📷 Photo";
    setConversations((prev) =>
      prev.map((c) =>
        c._id === selectedConversation._id
          ? {
              ...c,
              lastMessage: { text: preview, senderId: currentUserId, sentAt: new Date().toISOString() },
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
    return true;
  };

  // Send a text message
  const sendMessage = async () => {
    if (!messageText.trim() || !selectedConversation || sending) return;
    const text = messageText.trim();
    setMessageText("");
    setSending(true);
    try {
      const ok = await postMessage({ text });
      if (!ok) setMessageText(text); // restore on failure
    } catch (err) {
      console.error("Error sending message:", err);
      setMessageText(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Pick an image/GIF → upload → send as a message
  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !selectedConversation || uploading) return;
    setUploading(true);
    try {
      const token = getToken();
      if (!token) return;
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/chat/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await up.json();
      if (!up.ok) {
        console.error("Image upload failed:", data.error);
        return;
      }
      await postMessage({ imageUrl: data.imageUrl });
    } catch (err) {
      console.error("Error sending image:", err);
    } finally {
      setUploading(false);
    }
  };

  // Send a GIF chosen from the picker (GIPHY CDN url)
  const sendGif = async (url: string) => {
    setGifOpen(false);
    try {
      await postMessage({ imageUrl: url });
    } catch (err) {
      console.error("Error sending GIF:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Get the other participant's name for direct chats
  const getConversationName = (conv: ConversationData) => {
    if (conv.name) return conv.name;
    const other = conv.participants.find((p) => p._id !== currentUserId);
    return other?.name || "Chat";
  };

  const getOtherParticipant = (conv: ConversationData) => {
    return conv.participants.find((p) => p._id !== currentUserId);
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: MessageData[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msg.createdAt, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  // ---- Conversation List View ----
  if (!selectedConversation) {
    return (
      <PageTransition className="flex h-full flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">
            Messages
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {userRole === "trainer" || userRole === "admin"
              ? "Chat with your clients"
              : "Direct line to your coach"}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <MessageCircle className="h-8 w-8 text-zinc-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
              No conversations yet
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Your coach will appear here once assigned.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => {
              const other = getOtherParticipant(conv);
              const isTrainer = other?.role === "trainer";
              return (
                <motion.button
                  key={conv._id}
                  onClick={() => setSelectedConversation(conv)}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-all duration-200 hover:border-zinc-300 hover:shadow-sm active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${
                      isTrainer
                        ? "bg-gradient-to-br from-green-500 to-emerald-600"
                        : "bg-gradient-to-br from-zinc-400 to-zinc-500"
                    }`}
                  >
                    {(other?.name || "?")[0].toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {getConversationName(conv)}
                        {isTrainer && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Coach
                          </span>
                        )}
                      </h3>
                      {conv.lastMessage && (
                        <span className="ml-2 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                          {formatTime(conv.lastMessage.sentAt)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                        {conv.lastMessage?.text || "No messages yet"}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-bold text-white">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </PageTransition>
    );
  }

  // ---- Message View ----
  const otherParticipant = getOtherParticipant(selectedConversation);
  const isOtherTrainer = otherParticipant?.role === "trainer";

  return (
    <FeatureGuard
      feature="Chat"
      description="A direct line to your coach. Real conversations, real accountability. Coming soon."
      icon={<MessageCircle className="h-10 w-10" />}
    >
    <div className="fixed inset-0 z-40 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            onClick={() => {
              setSelectedConversation(null);
              setMessages([]);
              fetchConversations();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
              isOtherTrainer
                ? "bg-gradient-to-br from-green-500 to-emerald-600"
                : "bg-gradient-to-br from-zinc-400 to-zinc-500"
            }`}
          >
            {(otherParticipant?.name || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
              {getConversationName(selectedConversation)}
            </h2>
            {isOtherTrainer && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Your Coach
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="mx-auto max-w-3xl">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-200" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <MessageCircle className="h-7 w-7 text-zinc-400" />
              </div>
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  {/* Date divider */}
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    <span className="shrink-0 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                      {formatMessageDate(group.date)}
                    </span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </div>

                  {group.messages.map((msg) => {
                    const senderId =
                      typeof msg.senderId === "object"
                        ? msg.senderId._id
                        : msg.senderId;
                    const senderName =
                      typeof msg.senderId === "object"
                        ? msg.senderId.name
                        : "";
                    const isMe = senderId === currentUserId;

                    return (
                      <motion.div
                        key={msg._id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`mb-2 flex ${isMe ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                            isMe
                              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                              : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                          }`}
                        >
                          {!isMe && (
                            <p className="mb-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
                              {senderName}
                            </p>
                          )}
                          {msg.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={msg.imageUrl}
                                alt="attachment"
                                loading="lazy"
                                className={`max-h-72 w-auto max-w-full rounded-xl object-cover ${msg.text ? "mb-1.5" : ""}`}
                              />
                            </a>
                          )}
                          {msg.text && (
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {msg.text}
                            </p>
                          )}
                          <p
                            className={`mt-1 text-right text-[10px] ${
                              isMe
                                ? "text-zinc-400 dark:text-zinc-500"
                                : "text-zinc-400 dark:text-zinc-500"
                            }`}
                          >
                            {formatMessageTime(msg.createdAt)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPickImage}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Send a photo"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setGifOpen(true)}
            aria-label="Send a GIF"
            className="flex h-10 shrink-0 items-center justify-center rounded-full px-2.5 text-xs font-extrabold tracking-wide text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            GIF
          </button>
          <input
            ref={inputRef}
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            maxLength={5000}
            className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-green-500"
          />
          <button
            onClick={sendMessage}
            disabled={!messageText.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white transition-all duration-200 hover:bg-green-600 disabled:opacity-40 disabled:hover:bg-green-500 active:scale-95"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {gifOpen && <GifPicker onSelect={sendGif} onClose={() => setGifOpen(false)} />}
    </div>
    </FeatureGuard>
  );
}
