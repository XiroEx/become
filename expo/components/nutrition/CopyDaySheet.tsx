import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  bulkResultToast,
  copyDayForward,
  forwardTargetDates,
  needsBulkConfirm,
  type BulkSourceType,
} from "@/lib/nutrition/bulkSchedule";
import { titleCaseTag } from "@/lib/nutrition/mealPlanApi";
import { todayLocalKey } from "@/lib/nutrition/mealPlanDates";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * ─── Copy a day forward, natively (NP-177) ───────────────────────────────────
 *
 * The native port of the web's `CopyDayForwardSheet`
 * (`webapp/app/dashboard/timeline/PlanToolsSheets.tsx:58-295`): pick a source
 * date + source type (what they ate / what they planned) + N forward days,
 * then POST once to `/api/meal-plans/bulk-from-day` with
 * `{ sourceDate, sourceType, targetDates, mode: 'merge' }`.
 *
 * - Targets are `source + 1 .. source + forwardDays` (web lines 90-100).
 * - The server's merge mode decides duplicates; the sheet never emulates it.
 * - > 7 targets surfaces the web's confirm step (tap submit again).
 * - `onApplied` receives the web's toast text (`"<total> plans created"`,
 *   `timeline/page.tsx:1439-1441`) so the caller refetches like the web.
 */

export interface CopyDaySheetProps {
  visible: boolean;
  /** The day the sheet copies FROM by default (the selected day). */
  defaultSourceDate: string;
  onClose: () => void;
  /** Receives the toast text on success; the caller refetches. */
  onApplied: (toast: string) => void;
  /** Test seam — defaults to the real `apiFetch`. */
  apiFetch?: Parameters<typeof copyDayForward>[0]["apiFetch"];
}

const SOURCE_OPTIONS: { value: BulkSourceType; label: string }[] = [
  { value: "log", label: "What I ate" },
  { value: "plan", label: "What I planned" },
];

export function CopyDaySheet({
  visible,
  defaultSourceDate,
  onClose,
  onApplied,
  apiFetch,
}: CopyDaySheetProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [sourceDate, setSourceDate] = useState(defaultSourceDate);
  const [sourceType, setSourceType] = useState<BulkSourceType>("log");
  const [forwardDays, setForwardDays] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArmed, setConfirmArmed] = useState(false);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from open intent
      setSourceDate(defaultSourceDate);
       
      setSourceType("log");
       
      setForwardDays("5");
       
      setSubmitting(false);
       
      setError(null);
       
      setConfirmArmed(false);
    }
  }, [visible, defaultSourceDate]);

  const targetDates = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) return [];
    const n = Number(forwardDays);
    if (!Number.isFinite(n)) return [];
    return forwardTargetDates(sourceDate, n);
  }, [sourceDate, forwardDays]);

  const needsConfirm = needsBulkConfirm(targetDates.length);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  const doSubmit = useCallback(async () => {
    if (submitting || targetDates.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await copyDayForward({
        sourceDate,
        sourceType,
        targetDates,
        mode: "merge",
        ...(apiFetch ? { apiFetch } : {}),
        token: token ?? undefined,
      });
      onApplied(bulkResultToast(result, "plan"));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to copy day.");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, targetDates, sourceDate, sourceType, apiFetch, token, onApplied, onClose]);

  const handleSubmit = useCallback(() => {
    if (needsConfirm && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }
    void doSubmit();
  }, [needsConfirm, confirmArmed, doSubmit]);

  const submitLabel = submitting
    ? "Copying…"
    : needsConfirm && !confirmArmed
      ? `Copy to ${targetDates.length} days? Tap again`
      : `Copy to ${targetDates.length} day${targetDates.length === 1 ? "" : "s"}`;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Copy day forward"
      testID="copy-day-sheet"
      accessibilityLabel="Copy day forward"
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          <Text className="text-muted-foreground text-xs">
            Take a day&apos;s meals and plant them on upcoming days as plans.
          </Text>

          <Input
            testID="copy-day-source"
            label="From (YYYY-MM-DD)"
            placeholder={todayLocalKey()}
            value={sourceDate}
            onChangeText={(v) => {
              setSourceDate(v.trim());
              setConfirmArmed(false);
            }}
            accessibilityLabel="Source date"
          />

          <View style={{ gap: 6 }}>
            <Text className="text-foreground text-sm font-medium">Source</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {SOURCE_OPTIONS.map((opt) => {
                const selected = sourceType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    testID={`copy-day-source-${opt.value}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={opt.label}
                    onPress={() => {
                      setSourceType(opt.value);
                      setConfirmArmed(false);
                    }}
                    style={{
                      flex: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.card : "transparent",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: selected ? "600" : "400",
                        color: colors.foreground,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input
            testID="copy-day-forward-days"
            label="Copy forward (days, 1–30)"
            placeholder="5"
            keyboardType="numeric"
            value={forwardDays}
            onChangeText={(v) => {
              setForwardDays(v.replace(/[^0-9]/g, ""));
              setConfirmArmed(false);
            }}
            accessibilityLabel="Days to copy forward"
          />

          <Text testID="copy-day-targets" className="text-muted-foreground text-xs">
            {targetDates.length === 0
              ? "Enter a valid source date."
              : `Copying ${titleCaseTag(sourceType === "log" ? "log" : "plan")} from ${sourceDate} to ${targetDates.length} day${targetDates.length === 1 ? "" : "s"}.`}
          </Text>

          {needsConfirm ? (
            <Text testID="copy-day-confirm" className="text-muted-foreground text-xs">
              {confirmArmed
                ? `Tap submit again to copy ${targetDates.length} days.`
                : "That's a lot of days. We'll ask once more before submitting."}
            </Text>
          ) : null}

          {error ? (
            <Text
              testID="copy-day-error"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="text-destructive text-xs"
            >
              {error}
            </Text>
          ) : null}

          <Button
            testID="copy-day-submit"
            onPress={handleSubmit}
            disabled={submitting || targetDates.length === 0}
            loading={submitting}
            accessibilityLabel={submitLabel}
          >
            {submitLabel}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
