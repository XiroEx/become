import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { ArrowUp, Sparkles, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { runStore, useAiRun } from "@/lib/ai/runClient";
import { cleanReply } from "@/lib/ai/sanitize";
import {
  loadCoachChat,
  saveCoachChat,
  type ChatMessage,
} from "@/lib/ai/coachChatStore";
import { handleSheetRequestClose } from "@/lib/keyboard/handleSheetRequestClose";

/**
 * ─── COACH CHAT (NP-155) ────────────────────────────────────────────────────
 *
 * Native port of `webapp/components/ai/CoachChat.tsx:62-127` — the shared AI
 * chat surface behind "Talk to your coach" (Mind home) and the nutrition
 * consultant (nutrition day). One component, two surfaces, same contract:
 *
 *   - POSTs `{ domain?, message, history, grounding, conversationId }` to
 *     `endpoint` through the AI run client (NP-038); the run resolves to
 *     `{ text }`.
 *   - DURABLE: the thread (messages + the in-flight runId) is persisted per
 *     MEMBER under `become.chat.<memberId>.<persistKey>`
 *     (`lib/ai/coachChatStore.ts`) — closing the sheet mid-reply and
 *     reopening it (even after the app was killed) shows the answer, because
 *     the run itself keeps polling at the app level regardless of which
 *     screen is mounted (`lib/ai/runClient.ts`).
 *   - THE THREE REFUSALS travel from the run client with no extra handling
 *     here: a consent refusal opens the consent prompt (`runStore.start`
 *     raises it), a 429 spend cap never raises the upgrade sheet and instead
 *     lands as the server's plain "try again later" line IN THE THREAD (same
 *     as any other reply), and a plan gate — not reachable from this surface,
 *     coach chat carries no price — would show its sentence in the upgrade
 *     sheet exactly like every other AI surface.
 */

export interface CoachChatProps {
  visible: boolean;
  onClose: () => void;
  endpoint: string;
  domain?: string;
  title: string;
  subtitle?: string;
  greeting: string;
  placeholder?: string;
  grounding?: Record<string, unknown>;
  suggestions?: string[];
  /** Stable key → conversation + in-flight run survive close/reopen, scoped to the signed-in member. */
  persistKey: string;
  /** Label shown in the global activity pill while a reply generates. */
  runLabel?: string;
  /**
   * Header icon, user-message bubble, and send-button colour. Defaults to
   * `colors.primary` (the neutral zinc-900/white every other coach uses since
   * NP-313; it was the brand red) — pass this only
   * when a specific consultant has its own identity colour, e.g. the
   * nutrition consultant's teal (NP-262), matching the web's
   * `accentFrom`/`accentTo` gradient on that one sheet.
   */
  accentColor?: string;
  testID?: string;
}

const FALLBACK_REPLY =
  "I had trouble reaching the coach just now — try that again in a moment.";

const UNSET = Symbol("coach-chat-hydration-unset");

export function CoachChat({
  visible,
  onClose,
  endpoint,
  domain,
  title,
  subtitle,
  greeting,
  placeholder = "Type what you're working through…",
  grounding,
  suggestions = [],
  persistKey,
  runLabel = "Coach is replying",
  accentColor,
  testID = "coach-chat",
}: CoachChatProps) {
  const { colors, scrim } = useThemeTokens();
  const accent = accentColor ?? colors.primary;
  const { user } = useAuth();
  const memberId = typeof user?.id === "string" ? user.id : null;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: greeting },
  ]);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  // A stable, render-pure id for this mounted conversation — `useId()`
  // rather than `Date.now()`/`Math.random()`, which are impure during render.
  const reactId = useId();
  const convoId = useRef<string>(`c_${reactId.replace(/[^a-zA-Z0-9]/g, "")}`);
  const scrollRef = useRef<ScrollView>(null);
  // Sentinel distinct from both `null` (signed out) and any real member id,
  // so the very first render always triggers the hydration effect below.
  const hydratedForRef = useRef<string | null | typeof UNSET>(UNSET);

  // Restore this member's thread once (and again if the signed-in member
  // changes under us) — not on every open, so a reply that lands while the
  // sheet is still mounted but closed is never clobbered by a re-read.
  useEffect(() => {
    if (hydratedForRef.current === memberId) return;
    hydratedForRef.current = memberId;
    let cancelled = false;
    void (async () => {
      const stored = await loadCoachChat(persistKey, memberId);
      if (cancelled) return;
      if (stored) {
        setMessages(stored.messages);
        setPendingRunId(stored.pendingRunId);
      } else {
        setMessages([{ role: "assistant", text: greeting }]);
        setPendingRunId(null);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally NOT re-keyed on greeting: it only seeds a first-run thread.
  }, [memberId, persistKey]);

  // Observe the in-flight run (reattaches by id on reopen, relaunch, anything).
  const run = useAiRun(pendingRunId);
  const sending = !!pendingRunId && !!run && run.status === "pending";

  // Persist conversation + pending run whenever they change, once hydrated —
  // before hydration completes this would overwrite the stored thread with
  // the single-greeting placeholder state.
  useEffect(() => {
    if (!hydrated) return;
    void saveCoachChat(persistKey, memberId, { messages, pendingRunId });
  }, [hydrated, messages, pendingRunId, persistKey, memberId]);

  // When the pending run finishes (now, or after we reopened on top of one
  // still cooking), append the reply.
  useEffect(() => {
    if (!pendingRunId) return;
    if (!run) {
      // Syncs from the external run store (NP-038), not from props/state: a
      // run this component is waiting on was pruned (e.g. the app was
      // backgrounded past the 2h retention window) — nothing left to await.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingRunId(null);
      return;
    }
    if (run.status === "pending") return;
    const reply =
      cleanReply((run.text && run.text.trim()) || "") || FALLBACK_REPLY;
    setMessages((m) => [...m, { role: "assistant", text: reply }]);
    runStore.remove(pendingRunId);
    setPendingRunId(null);
  }, [run, pendingRunId]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      60,
    );
    return () => clearTimeout(t);
  }, [messages, sending, visible]);

  const send = useCallback(
    async (text: string) => {
      const msg = text.trim();
      // Guard against the hydration race: restoring a stored thread is async
      // (AsyncStorage), so a send that lands before it resolves would have
      // its message clobbered the moment hydration applies the (now stale)
      // read it started with. Blocking send until hydrated — which in
      // practice resolves in a frame or two — makes the ordering safe by
      // construction rather than by timing luck.
      if (!msg || sending || !hydrated) return;
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      setMessages((m) => [...m, { role: "user", text: msg }]);
      setInput("");
      const id = await runStore.start(
        endpoint,
        {
          domain,
          message: msg,
          history,
          grounding,
          conversationId: convoId.current,
        },
        {
          kind: domain ? `consultant.${domain}` : "coach",
          label: runLabel,
          meta: { persistKey },
        },
      );
      if (id) {
        setPendingRunId(id);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Connection hiccup — give that another try in a sec." },
        ]);
      }
    },
    [sending, hydrated, messages, endpoint, domain, grounding, runLabel, persistKey],
  );

  return (
    <RNModal
      visible={visible}
      // NP-319 point 8: don't let the hardware back button close the keyboard
      // AND the chat sheet in one press — see `handleSheetRequestClose`.
      onRequestClose={() => handleSheetRequestClose(onClose)}
      transparent
      statusBarTranslucent
      animationType="slide"
      testID={testID}
    >
      <Pressable
        testID={`${testID}-backdrop`}
        accessibilityRole="none"
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        style={{ flex: 1, backgroundColor: scrim, justifyContent: "flex-end" }}
      >
        <Pressable
          testID={`${testID}-sheet`}
          accessibilityRole="none"
          accessibilityViewIsModal
          accessibilityLabel={title}
          onAccessibilityEscape={onClose}
          onPress={() => {
            /* swallow */
          }}
          style={{
            height: "88%",
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: "hidden",
          }}
        >
          {/* NP-319: real Android keyboard avoidance — "undefined" did
              nothing, and this sheet is a `Modal`, where targetSdk 35's
              edge-to-edge resize never reaches. "height" is computed from
              the keyboard-show event instead. */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            {/* Header */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={{ alignItems: "center", marginBottom: 12 }}
              >
                <View
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.border,
                    opacity: 0.6,
                  }}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1,
                    marginRight: 12,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: accent,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                    }}
                  >
                    <Sparkles size={16} color={colors["primary-foreground"]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      testID={`${testID}-title`}
                      className="text-foreground text-base font-bold"
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  testID={`${testID}-close`}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={onClose}
                  style={[
                    minTouchTarget,
                    {
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 16,
                      backgroundColor: colors.muted,
                    },
                  ]}
                >
                  <X size={16} color={colors["muted-foreground"]} />
                </Pressable>
              </View>
            </View>

            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 10 }}
            >
              {messages.map((m, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <View
                    testID={`${testID}-message-${i}`}
                    style={{
                      maxWidth: "82%",
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor: m.role === "user" ? accent : colors.muted,
                    }}
                  >
                    <Text
                      style={{ fontSize: 14, lineHeight: 20 }}
                      className={m.role === "user" ? "text-primary-foreground" : "text-foreground"}
                    >
                      {m.text}
                    </Text>
                  </View>
                </View>
              ))}

              {sending ? (
                <View
                  testID={`${testID}-sending`}
                  style={{ flexDirection: "row", justifyContent: "flex-start" }}
                >
                  <View
                    style={{
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: colors.muted,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <ActivityIndicator size="small" color={colors["muted-foreground"]} />
                    <Text className="text-muted-foreground text-xs ml-2">thinking…</Text>
                  </View>
                </View>
              ) : null}

              {/* First-turn suggestion chips */}
              {messages.length === 1 && suggestions.length > 0 && !sending ? (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2 }}
                >
                  {suggestions.map((s) => (
                    <Pressable
                      key={s}
                      testID={`${testID}-suggestion-${s}`}
                      accessibilityRole="button"
                      accessibilityLabel={s}
                      onPress={() => void send(s)}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Text className="text-muted-foreground text-xs">{s}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>

            {/* Composer */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 8,
                paddingHorizontal: 12,
                paddingTop: 10,
                paddingBottom: 10,
                borderTopWidth: 1,
                borderColor: colors.border,
              }}
            >
              <TextInput
                testID={`${testID}-input`}
                value={input}
                onChangeText={setInput}
                placeholder={placeholder}
                placeholderTextColor={colors["muted-foreground"]}
                multiline
                accessibilityLabel={placeholder}
                style={{
                  flex: 1,
                  maxHeight: 120,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                }}
              />
              <Pressable
                testID={`${testID}-send`}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !input.trim() || sending }}
                onPress={() => void send(input)}
                disabled={!input.trim() || sending}
                style={[
                  minTouchTarget,
                  {
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: accent,
                    opacity: !input.trim() || sending ? 0.4 : 1,
                  },
                ]}
              >
                <ArrowUp size={18} color={colors["primary-foreground"]} />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

export default CoachChat;
