/**
 * "Send feedback" on the native Settings screen (NP-162).
 *
 * The web's user menu opens `FeedbackModal.tsx` (type, message, up to three
 * screenshots). This is the same form as a bottom sheet on the Settings screen:
 * the type chips, the message field, the screenshot row (picked through
 * NP-059's `captureImage("library")`, which is why the photo-library usage
 * string in `app.json` covers attaching a screenshot), and the send button
 * that POSTs `lib/feedback/sendFeedback.ts` with the app version, build, OS
 * and device model in `metadata`.
 *
 * Everything that touches the network or the photo library is injectable, so
 * this renders and behaves in jest without a device.
 */

import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { ImagePlus, X } from "lucide-react-native";
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
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";

const TYPE_OPTIONS: { id: FeedbackType; label: string }[] = [
  { id: "bug", label: "Bug" },
  { id: "feature", label: "Feature" },
  { id: "general", label: "General" },
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
      // The server answers 400 'Message is required'; showing its sentence
      // up front keeps an empty tap from looking broken while offline.
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

  // The button stays enabled on an empty message on purpose: unlike the web
  // (whose Send is disabled until there is text), an empty tap must SHOW the
  // server's 'Message is required' rather than silently doing nothing.
  const canSend = !sending && !sent;

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
        title="Send Feedback"
      >
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
                    style={[
                      minTouchTarget,
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: selected
                          ? colors.foreground
                          : colors.muted,
                      },
                    ]}
                  >
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
              label="What's on your mind?"
              placeholder="Describe the problem or idea…"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={2000}
              accessibilityHint={`${message.length} of 2000 characters`}
            />
            <Text className="text-muted-foreground text-xs">
              {message.length}/2000
            </Text>

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

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              {images.length < MAX_FEEDBACK_IMAGES ? (
                <Button
                  testID={`${testID}-add-photo`}
                  variant="ghost"
                  size="sm"
                  disabled={picking}
                  loading={picking}
                  accessibilityHint="Pick a screenshot from your photo library"
                  onPress={() => {
                    void handlePick();
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <ImagePlus size={14} color={colors.foreground} />
                    <Text className="text-foreground text-xs font-medium">
                      {images.length === 0
                        ? "Add photo"
                        : `${images.length}/${MAX_FEEDBACK_IMAGES}`}
                    </Text>
                  </View>
                </Button>
              ) : (
                <Text className="text-muted-foreground text-xs">
                  {images.length}/{MAX_FEEDBACK_IMAGES} photos
                </Text>
              )}
              <Button
                testID={`${testID}-send`}
                disabled={!canSend}
                loading={sending}
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
