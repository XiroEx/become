import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { AlertTriangle, Check, Pencil, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { EvidencePhotoPicker } from "@/components/nutrition/EvidencePhotoPicker";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  FOOD_FLAG_KIND_LABELS,
  FOOD_FLAG_KINDS,
  correctionToDisplay,
  correctionToStorage,
  fileFoodFlag,
  safeBasisFactor,
  type FoodFlagKind,
  type LogCorrection,
} from "@/lib/nutrition/foodFlags";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * ─── "Something look wrong?" natively (NP-174) ──────────────────────────────
 *
 * The web's `FlagFoodSheet.tsx`: a member says a food's calories, macros or
 * serving look wrong, attaches up to six photos, fixes their own log entry,
 * and follows their reports.
 *
 * Two different jobs behind one sheet, and which one is on offer depends on
 * whether a shared record exists:
 *
 * - With a foodId: report the catalogue AND fix your own entry.
 * - Without one (an AI photo/describe estimate that never matched a
 *   product): fixing your own entry is the only thing that means anything,
 *   so that is all it offers.
 *
 * A flag NEVER edits the shared Food: the catalogue is written only by the
 * verification agent, so a user's claim is evidence, never an edit. Fixing
 * their OWN log is a separate action on the correction panel behind this
 * sheet, and that is deliberate.
 */

export interface FlagFoodSheetProps {
  visible: boolean;
  /** The catalogue Food's ObjectId. Empty when there is no shared record. */
  foodId: string;
  foodName: string;
  onClose: () => void;
  /** Current values on the FOOD'S OWN basis, prefilled into the correction fields. */
  currentNutrition?: LogCorrection;
  /**
   * The amount the member is actually looking at, so the correction fields
   * can be shown on THAT basis instead of the food's storage basis.
   * `factor` converts storage basis -> displayed portion.
   */
  portion?: { label?: string; factor: number };
  /**
   * False when there is no shared catalogue record behind this entry. The
   * sheet then does the one thing that IS possible — fix the member's own
   * numbers — and hides the report half entirely.
   */
  canReport?: boolean;
  /**
   * When provided, the sheet offers "just fix it for my entry" ALONGSIDE
   * reporting. This only ever touches their own log.
   */
  onApplyToLog?: (values: LogCorrection) => void;
  /**
   * Also lets "Fix it for this entry" edit the serving size/label text, not
   * just macros. Off by default.
   */
  editableServingLabel?: boolean;
  /** Session JWT. Absent → the report half renders, disabled, rather than vanishing. */
  token?: string | null;
  /** DI seams for tests. The app leaves both unset. */
  fileImpl?: typeof fileFoodFlag;
  testID?: string;
}

const CORRECTION_FIELDS: {
  key: "calories" | "protein" | "carbs" | "fats" | "fiber";
  label: string;
  testID: string;
}[] = [
  { key: "calories", label: "Calories", testID: "flag-fix-calories" },
  { key: "protein", label: "Protein (g)", testID: "flag-fix-protein" },
  { key: "carbs", label: "Carbs (g)", testID: "flag-fix-carbs" },
  { key: "fats", label: "Fats (g)", testID: "flag-fix-fats" },
  { key: "fiber", label: "Fiber (g)", testID: "flag-fix-fiber" },
];

function parseNumberField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

export function FlagFoodSheet({
  visible,
  foodId,
  foodName,
  onClose,
  currentNutrition,
  portion,
  canReport = true,
  onApplyToLog,
  editableServingLabel = false,
  token,
  fileImpl = fileFoodFlag,
  testID = "flag-food",
}: FlagFoodSheetProps) {
  const { colors } = useThemeTokens();
  const factor = safeBasisFactor(portion?.factor);
  const basisLabel = portion?.label?.trim() || "serving";

  const [kinds, setKinds] = useState<FoodFlagKind[]>(["calories"]);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fixing, setFixing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [initialLabel, setInitialLabel] = useState("");

  function seedDraft(): void {
    const scaled = correctionToDisplay(
      currentNutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
      factor,
    );
    const seededLabel = editableServingLabel ? basisLabel : "";
    setDraft({
      calories: String(scaled.calories),
      protein: String(scaled.protein),
      carbs: String(scaled.carbs),
      fats: String(scaled.fats),
      fiber: String(scaled.fiber ?? 0),
    });
    setDraftLabel(seededLabel);
    setInitialLabel(seededLabel);
  }

  function startFixing(): void {
    seedDraft();
    setFixing(true);
  }

  function close(): void {
    setResult(null);
    setError(null);
    setNote("");
    setPhotos([]);
    setPhotoError(null);
    setFixing(false);
    setDraft(null);
    setDraftLabel("");
    setInitialLabel("");
    setKinds(["calories"]);
    onClose();
  }

  function toggleKind(id: FoodFlagKind): void {
    setKinds((prev) =>
      prev.includes(id)
        ? prev.length === 1
          ? prev
          : prev.filter((k) => k !== id)
        : [...prev, id],
    );
  }

  function applyFix(): void {
    if (!draft || !onApplyToLog) return;
    const parsed: Record<string, number> = {};
    for (const field of CORRECTION_FIELDS) {
      const value = parseNumberField(draft[field.key] ?? "");
      if (value === null || Number.isNaN(value)) {
        setError(`Enter a valid number for ${field.label}.`);
        return;
      }
      parsed[field.key] = value;
    }
    // Back to the storage basis. Full precision on the way out: rounding
    // here would drift the number the member just typed once it is scaled
    // again for display.
    const stored = correctionToStorage(
      {
        calories: parsed.calories ?? 0,
        protein: parsed.protein ?? 0,
        carbs: parsed.carbs ?? 0,
        fats: parsed.fats ?? 0,
        fiber: parsed.fiber ?? 0,
      },
      factor,
    );
    const labelChanged =
      editableServingLabel && draftLabel.trim() !== initialLabel.trim();
    onApplyToLog({
      ...stored,
      ...(labelChanged ? { servingLabel: draftLabel.trim() } : {}),
    });
    close();
  }

  async function submit(): Promise<void> {
    if (!canReport || !foodId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fileImpl({
        foodId,
        kinds,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(photos.length > 0 ? { photoUrls: photos } : {}),
        jwt: token ?? null,
      });
      if (res.status === "filed") {
        setResult(res.message);
      } else if (res.status === "signed-out") {
        setError("Please sign in to send a report.");
      } else {
        setError(res.message);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // With no catalogue record behind the entry, the report half has nothing
  // to act on, so the correction fields ARE the sheet.
  const showFixFirst = !canReport;

  // ONE header, not two (NP-275): the web shows a single title row — an
  // AlertTriangle + "Something look wrong?" (or, mid-fix, just "Fix it for
  // this entry") plus an explicit X — and no header row at all on the
  // success screen, which carries its own "Report sent" copy instead. This
  // used to print "Something look wrong?" a second time, inline in the body,
  // right under that same title.
  const onFixScreen = fixing || showFixFirst;
  const showHeader = !result;
  const sheetTitle = showHeader
    ? onFixScreen
      ? "Fix it for this entry"
      : "Something look wrong?"
    : undefined;

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={sheetTitle}
      testID={testID}
      headerLeading={
        showHeader && !onFixScreen ? (
          <AlertTriangle size={16} color={colors.accent} />
        ) : undefined
      }
      headerTrailing={
        showHeader ? (
          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-full bg-muted"
          >
            <X size={16} color={colors["muted-foreground"]} />
          </Pressable>
        ) : undefined
      }
    >
      <ScrollView
        testID={`${testID}-scroll`}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 12 }}>
          {fixing && draft ? (
            <>
              <Text className="text-muted-foreground text-xs">
                For <Text className="text-foreground font-semibold">{basisLabel}</Text>,
                your log only.{" "}
                {canReport
                  ? "The shared food isn't changed — report it below and we'll check it against the label."
                  : "This one was estimated rather than matched to a product, so there is nothing shared to report — correcting it here is the whole fix."}
              </Text>
              {CORRECTION_FIELDS.map((field) => (
                <Input
                  key={field.key}
                  testID={field.testID}
                  label={field.label}
                  keyboardType="numeric"
                  value={draft[field.key] ?? ""}
                  onChangeText={(val) => {
                    setDraft({ ...draft, [field.key]: val });
                    if (error) setError(null);
                  }}
                />
              ))}
              {editableServingLabel ? (
                <Input
                  testID="flag-fix-serving-label"
                  label="Serving size / label"
                  placeholder='e.g. "3 tortillas"'
                  maxLength={60}
                  value={draftLabel}
                  onChangeText={setDraftLabel}
                />
              ) : null}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID="flag-fix-back"
                    variant="secondary"
                    onPress={() => (canReport ? setFixing(false) : close())}
                  >
                    {canReport ? "Back" : "Cancel"}
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button testID="flag-fix-apply" onPress={applyFix}>
                    Use these values
                  </Button>
                </View>
              </View>
            </>
          ) : result ? (
            <View
              testID={`${testID}-success`}
              style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.success,
                }}
              >
                <Check size={20} color={colors["primary-foreground"]} />
              </View>
              <Text className="text-foreground text-sm font-semibold">
                Report sent
              </Text>
              <Text className="text-muted-foreground text-xs text-center">
                {result}
              </Text>
              <Text className="text-muted-foreground text-xs text-center">
                Your own entry is unchanged — edit it behind this sheet if the
                numbers are off for you.
              </Text>
              <Button testID={`${testID}-done`} onPress={close}>
                Done
              </Button>
            </View>
          ) : (
            <>
              <Text className="text-muted-foreground text-xs">
                Tell us what looks off about{" "}
                <Text className="text-foreground font-medium">{foodName}</Text>{" "}
                and we&rsquo;ll check it against the label. This reports the
                food for everyone; it doesn&rsquo;t change your entry.
              </Text>

              {onApplyToLog ? (
                <Button
                  testID={`${testID}-fix-entry`}
                  variant="secondary"
                  onPress={startFixing}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Pencil size={14} color={colors.foreground} />
                    <Text className="text-foreground text-sm font-semibold">
                      Fix it for this entry
                    </Text>
                  </View>
                </Button>
              ) : null}

              <Text className="text-muted-foreground text-[11px] font-semibold uppercase">
                What&rsquo;s off? Pick all that apply
              </Text>
              <View style={{ gap: 6 }}>
                {FOOD_FLAG_KINDS.map((id) => {
                  const selected = kinds.includes(id);
                  return (
                    <Pressable
                      key={id}
                      testID={`${testID}-kind-${id}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={FOOD_FLAG_KIND_LABELS[id]}
                      onPress={() => toggleKind(id)}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: selected ? colors.foreground : colors.border,
                        backgroundColor: selected
                          ? colors.foreground
                          : "transparent",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                      }}
                    >
                      <Text
                        className={`text-sm ${
                          selected ? "" : "text-foreground"
                        }`}
                        style={
                          selected ? { color: colors.background } : undefined
                        }
                      >
                        {FOOD_FLAG_KIND_LABELS[id]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <EvidencePhotoPicker
                photos={photos}
                onChange={setPhotos}
                onError={setPhotoError}
                choosePhotoLabel="Upload photo"
                testID={`${testID}-photos`}
              />
              {photoError ? (
                <Text
                  testID={`${testID}-photo-error`}
                  className="text-destructive text-xs font-medium"
                >
                  {photoError}
                </Text>
              ) : null}

              <Text className="text-muted-foreground text-[11px] font-semibold uppercase">
                Anything else? (optional)
              </Text>
              <Input
                testID={`${testID}-note`}
                accessibilityLabel="Anything else? (optional)"
                placeholder="e.g. my label says 45 cal per container"
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

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-cancel`}
                    variant="secondary"
                    disabled={submitting}
                    onPress={close}
                  >
                    Cancel
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  {/* Amber "Report it", matching the web's `bg-amber-600` CTA —
                      no `Button` variant draws this hue, so it is built off the
                      existing `accent`/`accent-foreground` Tailwind classes
                      rather than a literal (NP-123). */}
                  <Pressable
                    testID={`${testID}-submit`}
                    accessibilityRole="button"
                    accessibilityLabel="Report it"
                    accessibilityState={{
                      disabled: submitting || !token,
                      busy: submitting,
                    }}
                    disabled={submitting || !token}
                    onPress={() => void submit()}
                    style={minTouchTarget}
                    className={`flex-row items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 ${
                      submitting || !token ? "opacity-50" : ""
                    }`}
                  >
                    {submitting ? (
                      <ActivityIndicator
                        size="small"
                        color={colors["accent-foreground"]}
                      />
                    ) : null}
                    <Text className="text-accent-foreground text-base font-semibold">
                      {submitting ? "Sending…" : "Report it"}
                    </Text>
                  </Pressable>
                </View>
              </View>
              {!token ? (
                <Text className="text-muted-foreground text-xs text-center">
                  Sign in to send a report.
                </Text>
              ) : null}
            </>
          )}

          {showFixFirst && !fixing && !result ? (
            <View style={{ gap: 12 }}>
              <Text className="text-muted-foreground text-xs">
                This one was estimated rather than matched to a product, so
                there is nothing shared to report — correcting it here is the
                whole fix.
              </Text>
              <Button testID={`${testID}-fix-only`} onPress={startFixing}>
                Fix my entry
              </Button>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
