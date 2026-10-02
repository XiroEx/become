import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { AlertTriangle, CheckCircle2, Clock, Send, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { EvidencePhotoPicker } from "@/components/nutrition/EvidencePhotoPicker";
import {
  addReportEvidence,
  loadMyReports,
  markReportsRead,
  type FoodReport,
} from "@/lib/nutrition/foodFlags";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * The member's food reports, natively (NP-174).
 *
 * The web's `FoodReportsPanel.tsx`: until it existed, a report that we
 * disagreed with ended silently on our side — the member said the numbers
 * were wrong, the reviewer confirmed the record, and nobody told them. The
 * member is the only party actually holding the packet, so they need to know
 * it landed and that they can push back with better photos.
 *
 * Opening the list IS reading it: mark-as-read fires on open (the web's
 * `POST /api/nutrition/flags/mine {}`), which clears the unread-outcomes
 * badge.
 */

export interface FoodReportsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Session JWT. Absent → the list renders empty rather than erroring. */
  token?: string | null;
  /** DI seams for tests. The app leaves all three unset. */
  loadImpl?: typeof loadMyReports;
  markReadImpl?: typeof markReportsRead;
  evidenceImpl?: typeof addReportEvidence;
  testID?: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case "corrected":
      return "Fixed — thank you";
    case "confirmed":
      return "No change made";
    case "insufficient":
      return "Not enough to go on";
    default:
      return "Being checked";
  }
}

function statusTone(
  status: string,
  colors: { success: string; accent: string; primary: string },
): string {
  switch (status) {
    case "corrected":
      return colors.success;
    case "confirmed":
    case "insufficient":
      return colors.accent;
    default:
      return colors.primary;
  }
}

export function FoodReportsSheet({
  visible,
  onClose,
  token,
  loadImpl = loadMyReports,
  markReadImpl = markReportsRead,
  evidenceImpl = addReportEvidence,
  testID = "food-reports",
}: FoodReportsSheetProps) {
  const { colors } = useThemeTokens();
  const [items, setItems] = useState<FoodReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Opening the sheet IS reading it, so the open edge — not render — owns
  // the load. A ref (never state) carries the "already loaded this opening"
  // bit, so there is no set-state-in-effect at all.
  const openedRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadImpl({ jwt: token ?? null });
      if (res.status === "loaded") {
        setItems(res.items);
      } else if (res.status === "signed-out") {
        setItems([]);
      } else {
        setError(res.message);
      }
    } catch {
      setError("Could not load your reports. Try again.");
    } finally {
      setLoading(false);
    }
  }, [loadImpl, token]);

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    void reload();
    // Opening the panel IS reading it. Marking on open rather than per-item
    // keeps the badge honest: it means "there is something here you have not
    // looked at", not "you have unfinished work".
    if (token) {
      markReadImpl({ jwt: token }).catch(() => {});
    }
  }, [visible, reload, markReadImpl, token]);

  const active = items.find((r) => r.id === activeId) ?? null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Your food reports"
      testID={testID}
    >
      <ScrollView
        testID={`${testID}-scroll`}
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 420 }}
      >
        {loading ? (
          <View
            testID={`${testID}-loading`}
            style={{ alignItems: "center", paddingVertical: 32 }}
          >
            <ActivityIndicator color={colors["muted-foreground"]} />
          </View>
        ) : error ? (
          <View style={{ gap: 12, paddingVertical: 12 }}>
            <Text
              testID={`${testID}-error`}
              className="text-destructive text-sm text-center"
            >
              {error}
            </Text>
            <Button
              testID={`${testID}-retry`}
              variant="secondary"
              onPress={() => void reload()}
            >
              Try again
            </Button>
          </View>
        ) : items.length === 0 ? (
          <Text
            testID={`${testID}-empty`}
            className="text-muted-foreground text-sm text-center"
            style={{ paddingVertical: 32 }}
          >
            Nothing reported yet. Tap &ldquo;Something look wrong?&rdquo; on any
            food and we will check it.
          </Text>
        ) : (
          <View testID={`${testID}-list`} style={{ gap: 0 }}>
            {items.map((report) => {
              const tone = statusTone(report.status, colors);
              const Icon =
                report.status === "corrected"
                  ? CheckCircle2
                  : report.status === "open" || report.status === "attached"
                    ? Clock
                    : AlertTriangle;
              return (
                <View
                  key={report.id}
                  testID={`${testID}-row-${report.id}`}
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    paddingVertical: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Icon size={16} color={tone} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Text
                        className="text-foreground text-sm font-semibold"
                        numberOfLines={1}
                        style={{ flexShrink: 1 }}
                      >
                        {report.food.name}
                      </Text>
                      {report.unread ? (
                        <View
                          testID={`${testID}-unread-${report.id}`}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: colors.destructive,
                          }}
                        />
                      ) : null}
                    </View>
                    <Text
                      className="text-xs font-medium"
                      style={{ color: tone }}
                    >
                      {statusLabel(report.status)}
                    </Text>
                    {report.resolution ? (
                      <Text className="text-muted-foreground text-xs mt-1">
                        {report.resolution}
                      </Text>
                    ) : null}
                    {report.escalated ? (
                      <Text
                        className="text-xs font-medium mt-1"
                        style={{ color: colors.accent }}
                      >
                        Sent to a human to check by hand
                      </Text>
                    ) : null}
                    {report.canAddEvidence ? (
                      <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
                        <Button
                          testID={`${testID}-evidence-${report.id}`}
                          size="sm"
                          onPress={() => setActiveId(report.id)}
                        >
                          Still wrong? Send better photos
                        </Button>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {active ? (
        <EvidenceSheet
          report={active}
          token={token}
          evidenceImpl={evidenceImpl}
          onClose={() => setActiveId(null)}
          onDone={() => {
            setActiveId(null);
            void reload();
          }}
          testID={`${testID}-evidence-sheet`}
        />
      ) : null}
    </BottomSheet>
  );
}

/** The second-chance sheet: better photos, then run it again. */
function EvidenceSheet({
  report,
  token,
  evidenceImpl,
  onClose,
  onDone,
  testID = "report-evidence",
}: {
  report: FoodReport;
  token?: string | null;
  evidenceImpl: typeof addReportEvidence;
  onClose: () => void;
  onDone: () => void;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(): Promise<void> {
    if (photos.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await evidenceImpl({
        reportId: report.id,
        photoUrls: photos,
        ...(note.trim() ? { note: note.trim() } : {}),
        jwt: token ?? null,
      });
      if (res.status === "sent") {
        onDone();
      } else if (res.status === "signed-out") {
        setError("Please sign in to send evidence.");
      } else {
        setError(res.message);
      }
    } catch {
      setError("Could not send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet visible onClose={onClose} title="Send better evidence" testID={testID}>
      <ScrollView
        testID={`${testID}-scroll`}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 12 }}>
          <View>
            <Text className="text-foreground text-sm font-semibold">
              {report.food.name}
            </Text>
            {report.food.brand ? (
              <Text className="text-muted-foreground text-xs">
                {report.food.brand}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.muted,
              padding: 12,
            }}
          >
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase">
              What we found
            </Text>
            <Text className="text-foreground text-xs mt-1">
              {report.resolution ?? "We checked and did not change the record."}
            </Text>
            <Text className="text-foreground text-xs mt-2">
              Websites and databases can all be copying the same out-of-date
              figure. Your packet is the newest source there is — send it and a
              person will check it by hand.
            </Text>
          </View>

          <EvidencePhotoPicker
            photos={photos}
            onChange={setPhotos}
            onError={setError}
            emphatic
            disabled={sending}
            testID={`${testID}-photos`}
          />

          <Input
            testID={`${testID}-note`}
            label="Anything else? (optional)"
            placeholder="Anything else we should know?"
            multiline
            numberOfLines={2}
            value={note}
            onChangeText={setNote}
          />

          {error ? (
            <Text
              testID={`${testID}-error`}
              className="text-destructive text-xs font-medium"
            >
              {error}
            </Text>
          ) : null}

          <Button
            testID={`${testID}-submit`}
            loading={sending}
            disabled={photos.length === 0 || sending}
            onPress={() => void submit()}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Send size={14} color={colors["primary-foreground"]} />
              <Text className="text-primary-foreground text-sm font-bold">
                {sending ? "Sending…" : "Send and re-check"}
              </Text>
            </View>
          </Button>

          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel="Close evidence sheet"
            onPress={onClose}
            hitSlop={8}
            style={{ alignItems: "center", paddingVertical: 4 }}
          >
            <X size={18} color={colors["muted-foreground"]} />
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
