import { Pressable, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Settings2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface MacroValues {
  current: number;
  goal: number;
  /** Grams still planned (not yet logged) for today. */
  planned?: number;
}

export interface CalorieRingProps {
  consumed: number;
  goal: number;
  protein: MacroValues;
  carbs: MacroValues;
  fats: MacroValues;
  fiber?: number;
  goalLine?: string | null;
  onEditGoals?: () => void;
  /** Calories still planned for today, rendered as a light shadow arc. */
  plannedExtra?: number;
  testID?: string;
}

/**
 * Macro bar/value status — ported from `webapp/lib/nutrition/macroStatus.ts`
 * (NP-262). A floor target (protein) can only be "hit" or "under" — exceeding
 * it is always the win. A ceiling target (carbs, fats) earns a 5% grace band
 * before it counts as "over", so a rounding error does not read as a mistake.
 */
type MacroBarKind = "floor" | "ceiling";
type MacroBarStatus = "empty" | "under" | "hit" | "warn" | "over";

function macroBarStatus(current: number, goal: number, kind: MacroBarKind): MacroBarStatus {
  if (!Number.isFinite(goal) || goal <= 0) return "empty";
  if (!Number.isFinite(current) || current <= 0) return "empty";
  const ratio = current / goal;
  if (kind === "floor") return ratio >= 0.95 ? "hit" : "under";
  if (ratio > 1.05) return "over";
  if (ratio > 1) return "warn";
  if (ratio >= 0.95) return "hit";
  return "under";
}

/** Fill colour: STATUS wins once a target is met or blown; otherwise the
 *  macro's own identity colour (web's `MACRO_COLORS`: protein blue, carbs
 *  green, fats yellow). */
function macroBarFillClass(status: MacroBarStatus, identity: string): string {
  switch (status) {
    case "hit":
      return "bg-emerald-500";
    case "warn":
      return "bg-orange-500";
    case "over":
      return "bg-red-500";
    default:
      return identity;
  }
}

/** Text colour for the "123g / 200g" readout — web's `macroTextClass`. */
function macroValueClass(status: MacroBarStatus): string {
  switch (status) {
    case "hit":
      return "text-emerald-600 dark:text-emerald-400 font-semibold";
    case "warn":
      return "text-orange-600 dark:text-orange-400 font-semibold";
    case "over":
      return "text-red-500 font-semibold";
    default:
      return "text-muted-foreground";
  }
}

function renderMacroPill(
  current: number,
  goal: number,
  kind: "floor" | "ceiling",
  testID: string,
) {
  if (goal <= 0) return null;
  const safeCurrent = Math.max(0, current);
  const remaining = Math.max(0, Math.round(goal - safeCurrent));
  const excess = Math.max(0, Math.round(safeCurrent - goal));
  const ratio = safeCurrent / goal;

  let pillText = "";
  let bgClass = "bg-muted";
  let textClass = "text-muted-foreground";

  if (kind === "floor") {
    // Floor target (Protein): exceeding is a win
    if (excess > 0) {
      pillText = `+${excess}g`;
      bgClass = "bg-emerald-500/10";
      textClass = "text-emerald-600 dark:text-emerald-400";
    } else if (remaining > 0) {
      pillText = `${remaining}g left`;
      if (ratio >= 0.95) {
        bgClass = "bg-emerald-500/10";
        textClass = "text-emerald-600 dark:text-emerald-400";
      } else {
        bgClass = "bg-muted";
        textClass = "text-muted-foreground";
      }
    }
  } else {
    // Ceiling target (Carbs, Fats)
    if (excess > 0) {
      pillText = `+${excess}g`;
      if (ratio > 1.05) {
        bgClass = "bg-red-500/10";
        textClass = "text-red-500";
      } else {
        bgClass = "bg-orange-500/10";
        textClass = "text-orange-500";
      }
    } else if (remaining > 0) {
      pillText = `${remaining}g left`;
      if (ratio >= 0.95) {
        bgClass = "bg-emerald-500/10";
        textClass = "text-emerald-600 dark:text-emerald-400";
      } else {
        bgClass = "bg-muted";
        textClass = "text-muted-foreground";
      }
    }
  }

  if (!pillText) return null;

  return (
    <View
      testID={testID}
      className={`px-1.5 py-0.5 rounded ${bgClass}`}
      style={{ borderRadius: 4 }}
    >
      <Text className={`text-[10px] font-semibold ${textClass}`}>
        {pillText}
      </Text>
    </View>
  );
}

export function CalorieRing({
  consumed,
  goal,
  protein,
  carbs,
  fats,
  fiber,
  goalLine,
  onEditGoals,
  plannedExtra,
  testID = "calorie-ring",
}: CalorieRingProps) {
  const { colors, tint } = useThemeTokens();
  const safeGoal = Math.round(Number.isFinite(goal) && goal > 0 ? goal : 0);
  const safeConsumed = Math.round(Number.isFinite(consumed) && consumed > 0 ? consumed : 0);
  const safePlannedExtra = Math.round(
    Number.isFinite(plannedExtra) && (plannedExtra ?? 0) > 0 ? (plannedExtra ?? 0) : 0,
  );
  const remaining = safeGoal - safeConsumed;
  const isOver = remaining < 0;
  const percentage = safeGoal > 0 ? Math.min(safeConsumed / safeGoal, 1) : 0;
  const plannedPercentage =
    safeGoal > 0 && safePlannedExtra > 0
      ? Math.min((safeConsumed + safePlannedExtra) / safeGoal, 1)
      : percentage;
  const hasPlanned = plannedPercentage > percentage;

  const size = 160;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - percentage * circumference;
  const plannedDashoffset = circumference - plannedPercentage * circumference;

  const progressColor = isOver ? colors.destructive : colors.success;

  const proteinPct =
    protein.goal > 0
      ? Math.min((Math.max(protein.current, 0) / protein.goal) * 100, 100)
      : 0;
  const proteinPlannedPct =
    protein.goal > 0 && (protein.planned ?? 0) > 0
      ? Math.min((Math.max(protein.current + (protein.planned ?? 0), 0) / protein.goal) * 100, 100)
      : proteinPct;

  const carbsPct =
    carbs.goal > 0
      ? Math.min((Math.max(carbs.current, 0) / carbs.goal) * 100, 100)
      : 0;
  const carbsPlannedPct =
    carbs.goal > 0 && (carbs.planned ?? 0) > 0
      ? Math.min((Math.max(carbs.current + (carbs.planned ?? 0), 0) / carbs.goal) * 100, 100)
      : carbsPct;

  const fatsPct =
    fats.goal > 0
      ? Math.min((Math.max(fats.current, 0) / fats.goal) * 100, 100)
      : 0;
  const fatsPlannedPct =
    fats.goal > 0 && (fats.planned ?? 0) > 0
      ? Math.min((Math.max(fats.current + (fats.planned ?? 0), 0) / fats.goal) * 100, 100)
      : fatsPct;

  return (
    <>
      <Card testID={testID}>
      {/* Card header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text
          testID="calorie-ring-title"
          className="text-sm font-semibold text-foreground"
        >
          Daily Calories
        </Text>
        <Pressable
          testID="nutrition-edit-goals-btn"
          accessibilityRole="button"
          accessibilityLabel="Edit Goals"
          onPress={onEditGoals}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          <Settings2 size={14} color={colors["muted-foreground"]} />
          <Text className="text-xs font-medium text-foreground">
            Edit Goals
          </Text>
        </Pressable>
      </View>

      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={colors.border}
                strokeWidth={strokeWidth}
                fill="none"
              />
              {hasPlanned && (
                <Circle
                  testID="calorie-ring-planned-shadow"
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={tint("success", 0.35)}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={plannedDashoffset}
                  strokeLinecap="round"
                />
              )}
              {percentage > 0 && (
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={progressColor}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              )}
            </G>
          </Svg>
          <View
            style={{
              position: "absolute",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              testID="day-totals-kcal"
              className={`text-2xl font-bold tracking-tight ${
                isOver ? "text-red-500" : "text-foreground"
              }`}
            >
              {Math.abs(remaining)}
            </Text>
            <Text className="text-muted-foreground text-xs font-medium">
              {isOver ? "over" : "remaining"}
            </Text>
          </View>
        </View>

        {/* Goal breakdown */}
        <Text
          testID="day-totals-target"
          className="text-muted-foreground text-xs text-center mt-3"
        >
          Goal {safeGoal} - Food {safeConsumed} ={" "}
          <Text
            testID="day-totals-target-remaining"
            className={
              isOver
                ? "text-red-500 font-semibold"
                : "text-emerald-600 dark:text-emerald-400 font-semibold"
            }
          >
            {Math.abs(remaining)} {isOver ? "over" : "remaining"}
          </Text>
        </Text>

        {hasPlanned ? (
          <View
            testID="calorie-ring-planned-extra"
            style={{
              marginTop: 6,
              paddingHorizontal: 10,
              paddingVertical: 2,
              borderRadius: 9999,
              backgroundColor: tint("success", 0.12),
              alignSelf: "center",
            }}
          >
            <Text
              style={{
                color: colors.success,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              +{safePlannedExtra} planned
            </Text>
          </View>
        ) : null}
      </View>

      {/* Macro bars — status-colored (NP-262): emerald once a target is hit,
          orange/red once a ceiling is blown, else the macro's own identity
          colour (blue protein, green carbs, yellow fats — the web's
          `MACRO_COLORS`). No trailing macro-letter suffix on the readout;
          the row label above already names the macro. */}
      <View style={{ marginTop: 20, gap: 12 }}>
        {/* Protein — a FLOOR: exceeding it is a good outcome, never a warning. */}
        <View>
          {(() => {
            const proteinStatus = macroBarStatus(protein.current, protein.goal, "floor");
            return (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Text className="text-foreground text-sm font-medium">Protein</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      testID="day-totals-protein"
                      className={`text-xs ${macroValueClass(proteinStatus)}`}
                    >
                      {Math.round(protein.current)}g / {Math.round(protein.goal)}g
                    </Text>
                    {renderMacroPill(protein.current, protein.goal, "floor", "day-totals-protein-pill")}
                  </View>
                </View>
                <View testID="macro-track-protein" className="h-2.5 rounded-full bg-muted overflow-hidden relative">
                  {proteinPlannedPct > proteinPct && (
                    <View
                      testID="macro-bar-protein-planned"
                      className="h-full rounded-full bg-blue-500/40 absolute left-0"
                      style={{ width: `${proteinPlannedPct}%` }}
                    />
                  )}
                  <View
                    testID="macro-bar-protein"
                    className={`h-full rounded-full ${macroBarFillClass(proteinStatus, "bg-blue-600")}`}
                    style={{ width: `${proteinPct}%` }}
                  />
                </View>
              </>
            );
          })()}
        </View>

        {/* Carbs — a ceiling. */}
        <View>
          {(() => {
            const carbsStatus = macroBarStatus(carbs.current, carbs.goal, "ceiling");
            return (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Text className="text-foreground text-sm font-medium">Carbs</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      testID="day-totals-carbs"
                      className={`text-xs ${macroValueClass(carbsStatus)}`}
                    >
                      {Math.round(carbs.current)}g / {Math.round(carbs.goal)}g
                    </Text>
                    {renderMacroPill(carbs.current, carbs.goal, "ceiling", "day-totals-carbs-pill")}
                  </View>
                </View>
                <View testID="macro-track-carbs" className="h-2.5 rounded-full bg-muted overflow-hidden relative">
                  {carbsPlannedPct > carbsPct && (
                    <View
                      testID="macro-bar-carbs-planned"
                      className="h-full rounded-full bg-green-500/40 absolute left-0"
                      style={{ width: `${carbsPlannedPct}%` }}
                    />
                  )}
                  <View
                    testID="macro-bar-carbs"
                    className={`h-full rounded-full ${macroBarFillClass(carbsStatus, "bg-green-600")}`}
                    style={{ width: `${carbsPct}%` }}
                  />
                </View>
              </>
            );
          })()}
        </View>

        {/* Fats — a ceiling. Identity is yellow, distinct from the orange
            "slightly over" warning so the two never read as the same thing. */}
        <View>
          {(() => {
            const fatsStatus = macroBarStatus(fats.current, fats.goal, "ceiling");
            return (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Text className="text-foreground text-sm font-medium">Fats</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      testID="day-totals-fat"
                      className={`text-xs ${macroValueClass(fatsStatus)}`}
                    >
                      {Math.round(fats.current)}g / {Math.round(fats.goal)}g
                    </Text>
                    {renderMacroPill(fats.current, fats.goal, "ceiling", "day-totals-fat-pill")}
                  </View>
                </View>
                <View testID="macro-track-fats" className="h-2.5 rounded-full bg-muted overflow-hidden relative">
                  {fatsPlannedPct > fatsPct && (
                    <View
                      testID="macro-bar-fats-planned"
                      className="h-full rounded-full bg-yellow-400/40 absolute left-0"
                      style={{ width: `${fatsPlannedPct}%` }}
                    />
                  )}
                  <View
                    testID="macro-bar-fats"
                    className={`h-full rounded-full ${macroBarFillClass(fatsStatus, "bg-yellow-400")}`}
                    style={{ width: `${fatsPct}%` }}
                  />
                </View>
              </>
            );
          })()}
        </View>

        {/* Fiber */}
        {fiber !== undefined && fiber > 0 ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 2,
            }}
          >
            <Text className="text-muted-foreground text-xs">Fiber</Text>
            <Text
              testID="day-totals-fiber"
              className="text-muted-foreground text-xs font-medium"
            >
              {Math.round(fiber)}g
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
    {goalLine ? (
      <Text
        testID="nutrition-goal-line"
        className="-mt-2 text-center text-xs text-muted-foreground"
      >
        {goalLine}
      </Text>
    ) : null}
  </>
  );
}
