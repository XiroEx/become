/**
 * "Send feedback" on the native Settings screen (NP-162, visual pass NP-305).
 *
 * The web's user menu opens `FeedbackModal.tsx` (type, message, up to three
 * screenshots). This is the same form as a bottom sheet on the Settings screen:
 * the type chips, the message field, the screenshot row (picked through
 * NP-059's `captureImage("library")`, which is why the photo-library usage
 * string in `app.json` covers attaching a screenshot), and the send button
 * that POSTs `lib/feedback/sendFeedback.ts` with the app version, build, OS
 * and device model in `metadata`.
 *
 * NP-305 closed four gaps against `FeedbackModal.tsx`: a close X beside the
 * title (the backdrop tap still closes it too), icon chips for the type
 * selector (Bug / Lightbulb / MessageSquare, same as the web), a multi-line
 * message field carrying the web's placeholder with no extra label above it,
 * and a one-row footer whose Send button is disabled (grey, with its send
 * icon) until there is text — not merely while sending or already sent.
 *
 * Everything that touches the network or the photo library is injectable, so
 * this renders and behaves in jest without a device.
 */

import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import {
  Bug,
  ImagePlus,
  Lightbulb,
  MessageSquare,
  Send as SendIcon,
  X,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { PermissionDeniedNotice } from "@/components/media/PermissionDeniedNotice";
import type { PermissionDeniedCapture } from "@/lib/media/capture";
import {
  FEEDBACK_MESSAGE_REQUIRED,
  MAX_FEEDBACK_IMAGES,
  pickFeedbackScreenshot,
  sendFeedback,
  type FeedbackImage,
  type FeedbackType,
  type PickFeedbackScreenshotDeps,
  type SendFeedbackInput,
} from "@/lib/feedback/sendFeedback";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { hitSlopToMinTarget, minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";

// Same three types, same icons, as `webapp/components/FeedbackModal.tsx`'s
// `typeOptions`.
const TYPE_OPTIONS: {
  id: FeedbackType;
  label: string;
  Icon: typeof Bug;
}[] = [
  { id: "bug", label: "Bug", Icon: Bug },
  { id: "feature", label: "Feature", Icon: Lightbulb },
  { id: "general", label: "General", Icon: MessageSquare },
];

export interface FeedbackSheetProps {
  /** Session JWT. Absent → the row renders, disabled, rather than vanishing. */
  token?: string | null;
  /** DI seams for tests. */
  sendImpl?: (input: SendFeedbackInput) => Promise<
    | { status: "sent" }
    | { status: "signed-out" }
    | { status: "validation-error"; message: string }
    | { status: "failed"; httpStatus?: number; message: string }
  >;
  pickImpl?: (
    deps?: PickFeedbackScreenshotDeps,
  ) => Promise<
    | { status: "picked"; image: FeedbackImage }
    | { status: "cancelled" }
    | {
        status: "permission-denied";
        source: "camera" | "library";
        canAskAgain: boolean;
        message: string;
      }
    | { status: "failed"; message: string }
  >;
  testID?: string;
}

export function FeedbackSheet({
  token,
  sendImpl = sendFeedback,
  pickImpl = pickFeedbackScreenshot,
  testID = "feedback",
}: FeedbackSheetProps) {
  const { colors } = useThemeTokens();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("general");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [denial, setDenial] = useState<PermissionDeniedCapture | null>(null);

  function reset() {
    setType("general");
    setMessage("");
    setImages([]);
    setSent(false);
    setError(null);
    setDenial(null);
  }

  function close() {
    setOpen(false);
    // Let the sheet fade out before clearing it, the way the web's modal
    // resets 200ms after closing (`FeedbackModal.tsx#handleClose`).
    setTimeout(() => {
      reset();
    }, 200);
  }

  async function handlePick() {
    if (picking || images.length >= MAX_FEEDBACK_IMAGES) return;
    setPicking(true);
    setError(null);
    setDenial(null);
    try {
      const result = await pickImpl();
      if (result.status === "cancelled") return;
      if (result.status === "permission-denied") {
        setDenial(result);
        return;
      }
      if (result.status === "failed") {
        setError(result.message);
        return;
      }
      setImages((prev) =>
        [...prev, result.image].slice(0, MAX_FEEDBACK_IMAGES),
      );
    } finally {
      setPicking(false);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (sending || sent) return;
    const trimmed = message.trim();
    if (!trimmed) {
      // Send is disabled whenever the message is blank (see `canSend`
      // below), so a normal tap cannot reach this branch any more — it is
      // defense in depth for a caller that invokes `handleSend` some other
      // way, mirroring the server's own 400 'Message is required'.
      setError(FEEDBACK_MESSAGE_REQUIRED);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await sendImpl({
        type,
        message: trimmed,
        images,
        jwt: token ?? null,
      });
      if (result.status === "sent") {
        setSent(true);
        setTimeout(() => {
          close();
        }, 1500);
      } else if (result.status === "signed-out") {
        setError("Please sign in to send feedback.");
      } else {
        setError(result.message);
      }
    } catch {
      setError("Could not send feedback. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  // NP-305: Send now matches the web — grey and disabled until there is
  // text, not only while sending or already sent.
  const canSend = !sending && !sent && message.trim().length > 0;

  return (
    <View testID={testID}>
      <Pressable
        testID={`${testID}-row`}
        accessibilityRole="button"
        accessibilityLabel="Send feedback"
        accessibilityHint="Report a problem or request a feature"
        onPress={() => setOpen(true)}
        disabled={!token}
        style={[
          minTouchTarget,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 8,
            opacity: token ? 1 : 0.5,
          },
        ]}
      >
        <Text className="text-foreground text-sm font-medium">
          Send feedback
        </Text>
        <Text className="text-muted-foreground text-sm">›</Text>
      </Pressable>

      <Modal
        testID={`${testID}-modal`}
        visible={open}
        onClose={close}
        accessibilityLabel="Send Feedback"
      >
        {/* Own header, not `Modal`'s `title` prop, so a close X can sit
            beside the title — the web's modal has one top right; the
            backdrop tap (still wired through `onClose`) is the only way
            native had before NP-305. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text
            testID={`${testID}-modal-title`}
            accessibilityRole="header"
            className="text-foreground text-xl font-semibold"
          >
            Send Feedback
          </Text>
          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            hitSlop={hitSlopToMinTarget(32, 32)}
            style={{ padding: 8, borderRadius: 999 }}
          >
            <X size={20} color={colors["muted-foreground"]} />
          </Pressable>
        </View>

        {sent ? (
          <View
            testID={`${testID}-sent`}
            style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}
          >
            <Text className="text-foreground text-sm font-medium">
              Thanks for your feedback!
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View
              testID={`${testID}-type-selector`}
              style={{ flexDirection: "row", gap: 6 }}
              accessibilityRole="radiogroup"
            >
              {TYPE_OPTIONS.map((opt) => {
                const selected = type === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    testID={`${testID}-type-${opt.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={opt.label}
                    onPress={() => setType(opt.id)}
                    hitSlop={hitSlopToMinTarget(60, 30)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: selected
                        ? colors.foreground
                        : colors.muted,
                    }}
                  >
                    <opt.Icon
                      size={12}
                      color={
                        selected ? colors.background : colors["muted-foreground"]
                      }
                    />
                    <Text
                      style={[
                        WRAPPABLE_TEXT,
                        {
                          color: selected
                            ? colors.background
                            : colors["muted-foreground"],
                        },
                      ]}
                      className="text-xs font-medium"
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Input
              testID={`${testID}-message`}
              placeholder="What's on your mind?"
              accessibilityLabel="What's on your mind?"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={2000}
              accessibilityHint={`${message.length} of 2000 characters`}
            />

            {images.length > 0 ? (
              <View
                testID={`${testID}-images`}
                style={{ flexDirection: "row", gap: 8 }}
              >
                {images.map((img, i) => (
                  <View
                    key={`${img.name}-${i}`}
                    testID={`${testID}-image-${i}`}
                    style={{ position: "relative", width: 64, height: 64 }}
                  >
                    <Image
                      source={{ uri: img.dataUrl }}
                      accessibilityLabel={`Screenshot ${i + 1}`}
                      style={{ width: 64, height: 64, borderRadius: 8 }}
                    />
                    <Pressable
                      testID={`${testID}-image-${i}-remove`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove screenshot ${i + 1}`}
                      onPress={() => removeImage(i)}
                      hitSlop={8}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: colors.foreground,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <X size={12} color={colors.background} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {denial ? (
              <PermissionDeniedNotice
                testID={`${testID}-permission-denied`}
                denial={denial}
              />
            ) : null}

            {error ? (
              <Text
                testID={`${testID}-error`}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                className="text-destructive text-xs"
              >
                {error}
              </Text>
            ) : null}

            {/* One row, like the web: `0/2000 · Add photo` on the left, Send
                on the right — not the counter on its own line above an
                outlined pill. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 1,
                }}
              >
                <Text
                  testID={`${testID}-counter`}
                  className="text-muted-foreground text-xs"
                >
                  {`${message.length}/2000`}
                </Text>
                {images.length < MAX_FEEDBACK_IMAGES ? (
                  <Pressable
                    testID={`${testID}-add-photo`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      images.length === 0
                        ? "Add photo"
                        : `Add photo (${images.length}/${MAX_FEEDBACK_IMAGES} attached)`
                    }
                    accessibilityHint="Pick a screenshot from your photo library"
                    accessibilityState={{ disabled: picking }}
                    disabled={picking}
                    onPress={() => {
                      void handlePick();
                    }}
                    hitSlop={hitSlopToMinTarget(80, 28)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      opacity: picking ? 0.5 : 1,
                    }}
                  >
                    <ImagePlus size={14} color={colors["muted-foreground"]} />
                    <Text className="text-muted-foreground text-xs font-medium">
                      {images.length === 0
                        ? "Add photo"
                        : `${images.length}/${MAX_FEEDBACK_IMAGES}`}
                    </Text>
                  </Pressable>
                ) : (
                  <Text className="text-muted-foreground text-xs">
                    {images.length}/{MAX_FEEDBACK_IMAGES} photos
                  </Text>
                )}
              </View>
              <Button
                testID={`${testID}-send`}
                disabled={!canSend}
                loading={sending}
                icon={
                  sending ? undefined : (
                    <SendIcon size={14} color={colors["primary-foreground"]} />
                  )
                }
                onPress={() => {
                  void handleSend();
                }}
              >
                {sending ? "Sending…" : "Send"}
              </Button>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}
