import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Camera, ImagePlus, PencilLine, Plus, RotateCcw, Send, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import { PermissionDeniedNotice } from "@/components/media/PermissionDeniedNotice";
import { AuthedImage } from "@/components/media/AuthedImage";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useAuth } from "@/lib/auth/useAuth";
import { useEntitlements } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { showAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import {
  captureImage,
  type CapturedImage,
  type CaptureSource,
  type PermissionDeniedCapture,
} from "@/lib/media/capture";
import {
  estimateFromDescription,
  estimateFromPhoto,
  logEstimate,
  mealLogSourceFor,
  persistEstimate,
  reconcileEstimateItems,
  reviewItemFromSearchEntry,
  reviewItemsFor,
  uploadScanImage,
  ESTIMATE_EMPTY_MESSAGE,
  ESTIMATE_UNAVAILABLE_MESSAGE,
  type EstimateOrigin,
} from "@/lib/nutrition/plateEstimate";
import {
  combinedServingLabel,
  formatAmount,
  runningTotal,
  scaledNutrition,
  type ReviewItem,
} from "@become/core";
import { servingQuantityStep } from "@become/core";
import type { Food } from "@become/api-client";

export type EstimateSheetPhase =
  | "chooser"
  | "describe"
  | "compose"
  | "estimating"
  | "error"
  | "review"
  | "logging";

export interface EstimateSheetProps {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
  /** Initially-selected meal (default; the user can change it in review). */
  tag: string;
  /** Meal options to choose from when logging. */
  tagOptions?: string[];
  /** YYYY-MM-DD the log lands on. */
  dateKey: string;
  /** Today's YYYY-MM-DD — decides "now" vs noon stamping. */
  todayKey: string;
  /** Which surface to open on. */
  initialPhase?: "chooser" | "describe" | "compose";
  /** A captured image to open straight into the compose step. */
  initialImage?: CapturedImage | null;
  initialOrigin?: EstimateOrigin;
  /** Prefill text for the describe flow. */
  initialDescribe?: string | null;
  captureImpl?: typeof captureImage;
  testID?: string;
}

const STANDARD_MEALS = ["breakfast", "lunch", "dinner", "snack"];

/**
 * Native meal-photo / describe estimate sheet (NP-089).
 *
 * The web's `SnapPlateModal.tsx` as a bottom sheet: chooser (Take photo,
 * Upload, Describe + the free-scans line), compose (photo preview + optional
 * note), describe (text box), estimating, review (per-item portion controls,
 * remove, add-more search, meal picker, running total) and error.
 *
 * Refusal order mirrors the web's runEstimate: a gate opens the upgrade
 * sheet with the server's wording; a consent refusal opens the consent
 * prompt and nothing else; empty items ask for more detail; a thrown
 * failure is our side.
 */
export function EstimateSheet({
  visible,
  onClose,
  onLogged,
  tag,
  tagOptions,
  dateKey,
  todayKey,
  initialPhase = "chooser",
  initialImage = null,
  initialOrigin = "camera",
  initialDescribe = null,
  captureImpl = captureImage,
  testID = "estimate-sheet",
}: EstimateSheetProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const { data: entitlements, feature: entitlementFor, refresh: refreshEntitlements } =
    useEntitlements();

  const [phase, setPhase] = useState<EstimateSheetPhase>("chooser");
  const [describeText, setDescribeText] = useState("");
  const [composeNote, setComposeNote] = useState("");
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [origin, setOrigin] = useState<EstimateOrigin>("camera");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selectedTag, setSelectedTag] = useState(tag);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [denial, setDenial] = useState<PermissionDeniedCapture | null>(null);
  const [addMoreOpen, setAddMoreOpen] = useState(false);
  const [correctText, setCorrectText] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [imageThumb, setImageThumb] = useState<string>("");
  const savedScanIdRef = useRef<string | null>(null);
  const noteRef = useRef("");

  const mealOptions = tagOptions && tagOptions.length ? tagOptions : STANDARD_MEALS;

  // Reset on open; jump to the requested surface.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from open intent
    setSelectedTag(tag);
    setErrorMessage(null);
    setErrorHint(null);
    setDenial(null);
    setAddMoreOpen(false);
    setCorrectText("");
    setCorrecting(false);
    setImageThumb("");
    savedScanIdRef.current = null;
    noteRef.current = "";
    if (initialPhase === "compose" && initialImage) {
      setCaptured(initialImage);
      setOrigin(initialOrigin);
      setComposeNote("");
      setPhase("compose");
      setDescribeText("");
    } else if (initialPhase === "describe") {
      setDescribeText(initialDescribe ?? "");
      setComposeNote("");
      setCaptured(null);
      setPhase("describe");
    } else {
      setPhase("chooser");
      setDescribeText("");
      setComposeNote("");
      setCaptured(null);
    }
  }, [visible, tag, initialPhase, initialImage, initialOrigin, initialDescribe]);

  const getToken = useCallback(
    () => (token ?? undefined),
    [token],
  );

  const persistCurrent = useCallback(
    async (rows: ReviewItem[], extra?: { mealLogId?: string; loggedAt?: string; imageUrl?: string }) => {
      const res = await persistEstimate(
        {
          items: rows,
          origin,
          tag: selectedTag,
          ...(noteRef.current ? { note: noteRef.current } : {}),
          ...(savedScanIdRef.current ? { scanId: savedScanIdRef.current } : {}),
          ...(extra?.mealLogId ? { mealLogId: extra.mealLogId } : {}),
          ...(extra?.loggedAt ? { loggedAt: extra.loggedAt } : {}),
          ...(extra?.imageUrl ? { imageUrl: extra.imageUrl } : {}),
        },
        { getToken },
      );
      if (res.scanId) savedScanIdRef.current = res.scanId;
    },
    [origin, selectedTag, getToken],
  );

  const handleOutcome = useCallback(
    async (
      outcome: Awaited<ReturnType<typeof estimateFromPhoto>>,
      imageThumb: string,
    ) => {
      if (outcome.status === "estimated") {
        const fresh = reviewItemsFor(outcome.estimate);
        setImageThumb(imageThumb);
        setItems(fresh);
        setPhase("review");
        // Reconcile in the background; badges update in place.
        void reconcileEstimateItems(fresh, { getToken }).then((reconciled) => {
          setItems(reconciled);
          // Every generated estimate is saved to history.
          void persistCurrent(reconciled);
        });
        return;
      }
      if (outcome.status === "empty") {
        setErrorMessage(ESTIMATE_EMPTY_MESSAGE);
        setErrorHint(null);
        setPhase("error");
        return;
      }
      if (outcome.status === "gate") {
        // A price, not an outage — the sheet carries the server's wording.
        setPhase(origin === "describe" ? "describe" : captured ? "compose" : "chooser");
        showUpgradeSheet(outcome.gate as Parameters<typeof showUpgradeSheet>[0]);
        void refreshEntitlements().catch(() => {});
        return;
      }
      if (outcome.status === "consent") {
        // The consent prompt and nothing else — no outage line behind it.
        setPhase(origin === "describe" ? "describe" : captured ? "compose" : "chooser");
        showAiConsentPrompt();
        return;
      }
      setErrorMessage(ESTIMATE_UNAVAILABLE_MESSAGE);
      setErrorHint(null);
      setPhase("error");
    },
    [captured, getToken, origin, persistCurrent, refreshEntitlements],
  );

  const runPhotoEstimate = useCallback(
    async (image: CapturedImage, note: string) => {
      setPhase("estimating");
      savedScanIdRef.current = null;
      const trimmed = note.trim();
      noteRef.current = trimmed;
      try {
        const outcome = await estimateFromPhoto(
          image,
          trimmed || undefined,
          { getToken },
        );
        await handleOutcome(outcome, image.dataUrl);
      } catch {
        setErrorMessage(ESTIMATE_UNAVAILABLE_MESSAGE);
        setErrorHint(null);
        setPhase("error");
      }
    },
    [getToken, handleOutcome],
  );

  const runDescribeEstimate = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      setPhase("estimating");
      savedScanIdRef.current = null;
      noteRef.current = t;
      setOrigin("describe");
      try {
        const outcome = await estimateFromDescription(t, { getToken });
        await handleOutcome(outcome, "");
      } catch {
        setErrorMessage(ESTIMATE_UNAVAILABLE_MESSAGE);
        setErrorHint(null);
        setPhase("error");
      }
    },
    [getToken, handleOutcome],
  );

  const captureFrom = useCallback(
    async (source: CaptureSource) => {
      setCapturing(true);
      setDenial(null);
      try {
        const result = await captureImpl(source);
        if (result.status === "cancelled") return;
        if (result.status === "permission-denied") {
          setDenial(result);
          return;
        }
        if (result.status === "failed") {
          setErrorMessage(result.message);
          setErrorHint(null);
          setPhase("error");
          return;
        }
        setCaptured(result.image);
        setOrigin(source === "camera" ? "camera" : "library");
        setComposeNote("");
        setPhase("compose");
      } finally {
        setCapturing(false);
      }
    },
    [captureImpl],
  );

  const setMultiplier = useCallback((idx: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const step = servingQuantityStep(it.unitLabel);
        const multiplier = Math.max(step, parseFloat((it.multiplier + delta).toFixed(3)));
        const labelOverride = it.servingLabelBase
          ? combinedServingLabel(it.servingLabelBase, multiplier)
          : undefined;
        return { ...it, multiplier, labelOverride };
      }),
    );
  }, []);

  const toggleRemove = useCallback((idx: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, removed: !it.removed } : it)),
    );
  }, []);

  const handleAddMore = useCallback((food: Food) => {
    const nutrition = food.nutrition;
    if (!nutrition) return;
    const entry = {
      ...(food._id ? { foodId: String(food._id) } : {}),
      name: food.name,
      ...(food.brand ? { brand: String(food.brand) } : {}),
      servingSize: Number(food.servingSize) || 1,
      servingUnit: String(food.servingUnit || "serving"),
      servings: 1,
      nutrition: {
        calories: nutrition.calories ?? 0,
        protein: nutrition.protein ?? 0,
        carbs: nutrition.carbs ?? 0,
        fats: nutrition.fats ?? 0,
      },
    };
    setItems((prev) => [...prev, reviewItemFromSearchEntry(entry)]);
    setAddMoreOpen(false);
  }, []);

  const handleLog = useCallback(async () => {
    const active = items.filter((it) => !it.removed);
    if (active.length === 0) {
      setErrorMessage("Remove all items? Add at least one to log.");
      setErrorHint(null);
      return;
    }
    setPhase("logging");
    const result = await logEstimate(
      { items, origin, tag: selectedTag, dateKey, todayKey },
      { getToken },
    );
    if (!result.ok) {
      setErrorMessage(result.error ?? "Failed to log. Please try again.");
      setErrorHint(null);
      setPhase("error");
      return;
    }
    // Update the history record with the final items + meal-log link +
    // full-res image. Best-effort.
    let imageUrl: string | undefined;
    if (captured) {
      const uploaded = await uploadScanImage(captured, { getToken });
      if (uploaded) imageUrl = uploaded;
    }
    const loggedAt =
      dateKey === todayKey ? new Date().toISOString() : `${dateKey}T12:00:00.000Z`;
    await persistCurrent(active, {
      ...(result.mealLogId ? { mealLogId: result.mealLogId } : {}),
      loggedAt,
      ...(imageUrl ? { imageUrl } : {}),
    });
    onLogged();
    onClose();
  }, [items, origin, selectedTag, dateKey, todayKey, getToken, captured, persistCurrent, onLogged, onClose]);

  const totals = useMemo(() => runningTotal(items), [items]);
  const activeCount = useMemo(() => items.filter((it) => !it.removed).length, [items]);

  const scansLine = useMemo(() => {
    if (!entitlements || entitlements.enforced === false) return null;
    const scans = entitlementFor("ai-food-estimate");
    if (!scans || scans.limit == null || scans.remaining == null) return null;
    const limit = scans.limit;
    const remaining = scans.remaining;
    return `${remaining} of ${limit} free scan${limit === 1 ? "" : "s"} left today`;
  }, [entitlements, entitlementFor]);

  const sourceLabel = mealLogSourceFor(origin);

  return (
    <>
      <BottomSheet
        visible={visible && !addMoreOpen}
        onClose={onClose}
        title="Snap your plate"
        testID={testID}
      >
        <ScrollView
          testID={`${testID}-body`}
          style={{ maxHeight: 520 }}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {phase === "chooser" && (
            <View testID={`${testID}-chooser`} style={{ gap: 10, paddingTop: 4 }}>
              <Text className="text-foreground text-base font-bold text-center">
                Snap or upload your plate
              </Text>
              <Text className="text-muted-foreground text-sm text-center">
                A photo or a few words becomes an itemised estimate you can adjust.
              </Text>
              {denial ? (
                <PermissionDeniedNotice denial={denial} testID={`${testID}-denial`} />
              ) : null}
              <Button
                testID={`${testID}-take-photo`}
                onPress={() => void captureFrom("camera")}
                disabled={capturing}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Camera size={16} color={colors["primary-foreground"]} />
                  <Text className="text-primary-foreground text-sm font-semibold">
                    {capturing ? "Opening camera…" : "Take photo"}
                  </Text>
                </View>
              </Button>
              <Button
                testID={`${testID}-upload-photo`}
                variant="secondary"
                onPress={() => void captureFrom("library")}
                disabled={capturing}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ImagePlus size={16} color={colors.foreground} />
                  <Text className="text-foreground text-sm font-semibold">Upload photo</Text>
                </View>
              </Button>
              <Button
                testID={`${testID}-describe`}
                variant="ghost"
                onPress={() => setPhase("describe")}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <PencilLine size={16} color={colors.foreground} />
                  <Text className="text-foreground text-sm font-medium">Describe it instead</Text>
                </View>
              </Button>
              {scansLine ? (
                <Text
                  testID={`${testID}-scans-left`}
                  className="text-muted-foreground text-xs text-center font-medium"
                >
                  {scansLine}
                </Text>
              ) : null}
            </View>
          )}

          {phase === "describe" && (
            <View testID={`${testID}-describe`} style={{ gap: 12, paddingTop: 4 }}>
              <Text className="text-foreground text-base font-bold text-center">
                Describe your meal
              </Text>
              <Text className="text-muted-foreground text-sm text-center">
                In your words — the food and portions, plus sauces, sides and drinks.
              </Text>
              <Input
                testID={`${testID}-describe-input`}
                placeholder="e.g. chicken burrito bowl with rice, black beans, guac and salsa"
                value={describeText}
                onChangeText={setDescribeText}
                multiline
                numberOfLines={4}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-describe-back`}
                    variant="secondary"
                    onPress={() => setPhase("chooser")}
                  >
                    Back
                  </Button>
                </View>
                <View style={{ flex: 2 }}>
                  <Button
                    testID={`${testID}-describe-estimate`}
                    onPress={() => void runDescribeEstimate(describeText)}
                    disabled={!describeText.trim()}
                  >
                    Estimate
                  </Button>
                </View>
              </View>
            </View>
          )}

          {phase === "compose" && captured && (
            <View testID={`${testID}-compose`} style={{ gap: 12, paddingTop: 4 }}>
              <View
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: colors.muted,
                  height: 200,
                }}
              >
                <Image
                  source={{ uri: captured.dataUrl }}
                  style={{ width: "100%", height: 200 }}
                  resizeMode="cover"
                  testID={`${testID}-compose-preview`}
                  accessibilityLabel="Your photo"
                />
              </View>
              <Input
                testID={`${testID}-compose-note`}
                label="Add a note (optional)"
                placeholder="Anything the photo misses — sauces, sides, drinks, portions…"
                value={composeNote}
                onChangeText={setComposeNote}
                multiline
                numberOfLines={3}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-compose-back`}
                    variant="secondary"
                    onPress={() => setPhase("chooser")}
                  >
                    Back
                  </Button>
                </View>
                <View style={{ flex: 2 }}>
                  <Button
                    testID={`${testID}-compose-estimate`}
                    onPress={() => void runPhotoEstimate(captured, composeNote)}
                  >
                    Estimate
                  </Button>
                </View>
              </View>
            </View>
          )}

          {(phase === "estimating" || phase === "logging") && (
            <View
              testID={`${testID}-loading`}
              style={{ alignItems: "center", gap: 12, paddingVertical: 48 }}
            >
              <ActivityIndicator size="large" color={colors.success} />
              <Text className="text-muted-foreground text-sm">
                {phase === "estimating" ? "Reading your plate…" : "Logging…"}
              </Text>
            </View>
          )}

          {phase === "error" && (
            <View testID={`${testID}-error`} style={{ gap: 12, paddingVertical: 24, alignItems: "center" }}>
              <Text className="text-foreground text-base font-bold text-center">
                {errorMessage ?? "Something went wrong."}
              </Text>
              {errorHint ? (
                <Text className="text-muted-foreground text-sm text-center">{errorHint}</Text>
              ) : null}
              <Button testID={`${testID}-error-back`} onPress={() => setPhase("chooser")}>
                Try again
              </Button>
            </View>
          )}

          {phase === "review" && (
            <View testID={`${testID}-review`} style={{ gap: 10, paddingTop: 4 }}>
              {imageThumb ? (
                imageThumb.startsWith("/api/blob/") ? (
                  <AuthedImage
                    source={imageThumb}
                    accessibilityLabel="Your plate"
                    testID={`${testID}-review-photo`}
                    containerStyle={{ height: 140, borderRadius: 12 }}
                    style={{ height: 140, borderRadius: 12 }}
                  />
                ) : (
                  <Image
                    source={{ uri: imageThumb }}
                    style={{ width: "100%", height: 140, borderRadius: 12 }}
                    resizeMode="cover"
                    testID={`${testID}-review-photo`}
                    accessibilityLabel="Your plate"
                  />
                )
              ) : null}
              <Text className="text-muted-foreground text-xs">
                AI estimate — adjust if needed · {sourceLabel}
                {correcting ? " · Applying correction…" : ""}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    testID={`${testID}-correct-input`}
                    placeholder='Not right? e.g. "it was 6 tacos"'
                    value={correctText}
                    onChangeText={setCorrectText}
                  />
                </View>
                <Pressable
                  testID={`${testID}-correct-send`}
                  accessibilityRole="button"
                  accessibilityLabel="Apply correction"
                  disabled={!correctText.trim() || correcting}
                  onPress={() => {
                    const t = correctText.trim();
                    if (!t || correcting) return;
                    setCorrectText("");
                    setCorrecting(true);
                    // Corrections ride the describe door on the same allowance
                    // ticket rules as the web; NP-090 owns the ticketed flow.
                    // The current estimate stays on screen behind the spinner.
                    void estimateFromDescription(t, { getToken })
                      .then(async (outcome) => {
                        if (outcome.status === "estimated") {
                          const fresh = reviewItemsFor(outcome.estimate);
                          setItems(fresh);
                          void reconcileEstimateItems(fresh, { getToken }).then(
                            (reconciled) => {
                              setItems(reconciled);
                              void persistCurrent(reconciled);
                            },
                          );
                        }
                      })
                      .catch(() => {})
                      .finally(() => setCorrecting(false));
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: colors.success,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: correctText.trim() ? 1 : 0.4,
                  }}
                >
                  <Send size={16} color={colors["primary-foreground"]} />
                </Pressable>
              </View>
              {items.map((item, idx) => {
                const scaled = scaledNutrition(item, item.multiplier);
                const badge = item.match
                  ? item.match.kind === "food"
                    ? "In your foods"
                    : item.match.kind === "recipe"
                      ? "Recipe"
                      : "Your meal"
                  : item.matchChecked
                    ? "New"
                    : "Checking…";
                return (
                  <View
                    key={`${item.name}-${idx}`}
                    testID={`${testID}-item-${idx}`}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 12,
                      padding: 12,
                      gap: 8,
                      opacity: item.removed ? 0.55 : 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.brand ? (
                          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                            {item.brand}
                          </Text>
                        ) : null}
                        <Text className="text-muted-foreground text-xs">
                          {formatAmount(item.multiplier, item.unitLabel)} · {badge}
                        </Text>
                      </View>
                      <Text className="text-foreground text-sm font-bold tabular-nums">
                        {scaled.calories} cal
                      </Text>
                      <Pressable
                        testID={`${testID}-item-${idx}-remove`}
                        accessibilityRole="button"
                        accessibilityLabel={item.removed ? "Restore item" : "Remove item"}
                        onPress={() => toggleRemove(idx)}
                        style={{ padding: 6 }}
                      >
                        {item.removed ? (
                          <RotateCcw size={16} color={colors.foreground} />
                        ) : (
                          <Trash2 size={16} color={colors.foreground} />
                        )}
                      </Pressable>
                    </View>
                    {!item.removed && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Pressable
                          testID={`${testID}-item-${idx}-minus`}
                          accessibilityRole="button"
                          accessibilityLabel="Decrease portion"
                          onPress={() => setMultiplier(idx, -servingQuantityStep(item.unitLabel))}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text className="text-foreground text-base font-bold">−</Text>
                        </Pressable>
                        <Text
                          testID={`${testID}-item-${idx}-amount`}
                          className="text-foreground text-sm font-semibold tabular-nums"
                        >
                          {formatAmount(item.multiplier, item.unitLabel)}
                        </Text>
                        <Pressable
                          testID={`${testID}-item-${idx}-plus`}
                          accessibilityRole="button"
                          accessibilityLabel="Increase portion"
                          onPress={() => setMultiplier(idx, servingQuantityStep(item.unitLabel))}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text className="text-foreground text-base font-bold">+</Text>
                        </Pressable>
                        <Text className="text-muted-foreground text-xs tabular-nums">
                          P {scaled.protein}g · C {scaled.carbs}g · F {scaled.fats}g
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
              <Pressable
                testID={`${testID}-add-more`}
                accessibilityRole="button"
                accessibilityLabel="Add more food"
                onPress={() => setAddMoreOpen(true)}
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Plus size={16} color={colors.foreground} />
                <Text className="text-foreground text-sm font-medium">
                  Missing something? Add here
                </Text>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {mealOptions.map((m) => {
                  const active = m === selectedTag;
                  return (
                    <Pressable
                      key={m}
                      testID={`${testID}-meal-${m}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Log to ${m}`}
                      onPress={() => setSelectedTag(m)}
                      style={{
                        borderWidth: 1,
                        borderColor: active ? colors.success : colors.border,
                        backgroundColor: active ? colors.success : "transparent",
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <Text
                        className="text-xs font-semibold capitalize"
                        style={{ color: active ? colors["primary-foreground"] : colors.foreground }}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View
                testID={`${testID}-totals`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  backgroundColor: colors.muted,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text className="text-muted-foreground text-xs font-medium">
                  {activeCount} item{activeCount === 1 ? "" : "s"}
                </Text>
                <Text className="text-foreground text-sm font-bold tabular-nums">
                  {totals.calories} cal · P {totals.protein}g · C {totals.carbs}g · F {totals.fats}g
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  testID={`${testID}-retry`}
                  accessibilityRole="button"
                  accessibilityLabel="Start over"
                  onPress={() => setPhase("chooser")}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <RotateCcw size={16} color={colors.foreground} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-log`}
                    onPress={() => void handleLog()}
                    disabled={activeCount === 0}
                  >
                    Add to {selectedTag}
                  </Button>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheet>

      <FoodSearchSheet
        visible={addMoreOpen && phase === "review"}
        onClose={() => setAddMoreOpen(false)}
        currentTag={selectedTag}
        onPickFood={handleAddMore}
        onPickMeal={(_meal) => setAddMoreOpen(false)}
        testID={`${testID}-add-more-sheet`}
      />
    </>
  );
}

export default EstimateSheet;
