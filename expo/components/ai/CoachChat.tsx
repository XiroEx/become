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
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { resolveToken } from "@/lib/theme/tokens";
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
   * Header icon tile and send-button colour. Defaults to `colors.primary`
   * (the neutral zinc-900/white every other coach uses since NP-313) —
   * pass this only when a specific consultant has its own FLAT identity
   * colour with no web gradient counterpart, e.g. the nutrition
   * consultant's teal (NP-262).
   *
   * Never the message bubble: the web's user bubble is always
   * `bg-zinc-900 dark:bg-white` regardless of `accentFrom`/`accentTo`
   * (`webapp/components/ai/CoachChat.tsx:178-182`), so this component
   * matches that unconditionally too (NP-301).
   */
  accentColor?: string;
  /**
   * Two-stop gradient for the header icon tile and the send button,
   * matching the web's `bg-gradient-to-br ${accentFrom} ${accentTo}`
   * (NP-301) — e.g. the mindset coach's violet→green
   * (`tokens.ts`'s `mind-violet` / `mind-green`, NP-296). Takes priority
   * over `accentColor` when both are given. Pass this, not `accentColor`,
   * for any consultant whose web teaser uses a real two-colour gradient.
   */
  accentGradient?: readonly [string, string];
  testID?: string;
}

const FALLBACK_REPLY =
  "I had trouble reaching the coach just now — try that again in a moment.";

const UNSET = Symbol("coach-chat-hydration-unset");

/**
 * `useSafeAreaInsets` throws without a `SafeAreaProvider` above it in the
 * tree; the real app always has one (`app/_layout.tsx`), but this sheet's
 * own tests (`__tests__/coachChatNP155.test.tsx`) mount it bare. Falling
 * back to zero insets there keeps this a no-op in tests while fixing the
 * real device (NP-301: the composer was sitting on the gesture bar with no
 * bottom inset on Android).
 */
function useSafeAreaInsetsOrZero() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

/** White text/icon on an identity-coloured tile, matching the web's
 * unconditional `text-white` on the header span and the send button
 * (`webapp/components/ai/CoachChat.tsx:155,243`) — neither flips with the
 * scheme the way `colors["primary-foreground"]` does. Reached through
 * `resolveToken` at a fixed "light" mode (whose `primary-foreground` IS
 * white) rather than a hand-written literal (NP-123). */
const ON_ACCENT_WHITE = resolveToken("primary-foreground", "light");

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
  accentGradient,
  testID = "coach-chat",
}: CoachChatProps) {
  const { colors, scrim } = useThemeTokens();
  const insets = useSafeAreaInsetsOrZero();
  // Flat fallback for the header tile / send button when no gradient is
  // given — rendered through the same `LinearGradient` with both stops
  // equal, so there is exactly one code path for "tile colour" below.
  const flatAccent = accentColor ?? colors.primary;
  const tileGradient: readonly [string, string] =
    accentGradient ?? [flatAccent, flatAccent];
  const hasIdentityAccent = Boolean(accentColor) || Boolean(accentGradient);
  const tileForeground = hasIdentityAccent
    ? ON_ACCENT_WHITE
    : colors["primary-foreground"];
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
                  <LinearGradient
                    testID={`${testID}-header-icon`}
                    colors={tileGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                    }}
                  >
                    <Sparkles size={16} color={tileForeground} />
                  </LinearGradient>
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
                      // The web squares off the corner nearest the tail on
                      // each bubble — `rounded-br-md` on the user's,
                      // `rounded-bl-md` on the coach's (NP-301).
                      borderBottomRightRadius: m.role === "user" ? 6 : 18,
                      borderBottomLeftRadius: m.role === "user" ? 18 : 6,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      // Always the web's neutral `bg-zinc-900 dark:bg-white`
                      // on the user bubble — never the header/send accent,
                      // which the web never applies here either (NP-301).
                      backgroundColor: m.role === "user" ? colors.primary : colors.muted,
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
                        // Matches the web's `px-3 py-1.5` exactly (12px /
                        // 6px at the 16px root) — NP-301, these were
                        // rendering visibly smaller than web.
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Text
                        style={{ fontSize: 12, lineHeight: 16 }}
                        className="text-muted-foreground"
                      >
                        {s}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>

            {/* Composer */}
            <View
              testID={`${testID}-composer`}
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 8,
                paddingHorizontal: 12,
                paddingTop: 10,
                // The web's `calc(env(safe-area-inset-bottom,0px) + 0.625rem)`
                // — without it the composer sat flush on the gesture bar on
                // Android (NP-301).
                paddingBottom: insets.bottom + 10,
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
                    overflow: "hidden",
                    opacity: !input.trim() || sending ? 0.4 : 1,
                  },
                ]}
              >
                <LinearGradient
                  testID={`${testID}-send-gradient`}
                  colors={tileGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    flex: 1,
                    width: "100%",
                    height: "100%",
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ArrowUp size={18} color={tileForeground} />
                </LinearGradient>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

export default CoachChat;
