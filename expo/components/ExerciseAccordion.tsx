import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, ChevronUp, Dumbbell, Play } from "lucide-react-native";
import { Text } from "@/components/Text";
import { FramedVideo } from "@/components/FramedVideo";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";

export type AccordionTab = "video" | "instructions" | "tips";

export interface ProgramExerciseDetail {
  slug: string;
  name: string;
  type?: string;
  sets?: number;
  reps?: string;
  repsUnit?: string;
  rest?: string;
  details?: string;
  tip?: string;
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  videoTrim?: VideoTrimOverride | null;
}

export interface ExerciseAccordionProps {
  exercise: ProgramExerciseDetail;
  index: number;
  isInGroup?: boolean;
  isExpanded?: boolean;
  isPlaying?: boolean;
  onToggleExpand?: () => void;
  onPlayPress?: () => void;
  testID?: string;
}

const DEFAULT_INSTRUCTIONS: Record<string, string[]> = {
  strength: [
    "Set up your equipment and ensure proper form before starting.",
    "Control the weight through the full range of motion.",
    "Breathe out during the exertion phase, breathe in during the eccentric phase.",
    "Rest for the prescribed time between sets.",
  ],
  conditioning: [
    "Warm up properly before starting.",
    "Maintain consistent pace throughout.",
    "Focus on your breathing rhythm.",
    "Monitor your heart rate if possible.",
  ],
  warmup: [
    "Perform movements slowly and with control.",
    "Focus on gradually increasing range of motion.",
    "Don't bounce or force the stretch.",
  ],
  abs: [
    "Engage your core throughout the movement.",
    "Keep your lower back pressed to the floor when applicable.",
    "Focus on slow, controlled contractions.",
  ],
};

const DEFAULT_TIPS: Record<string, string[]> = {
  strength: [
    "Start with a weight you can control for all reps.",
    "Focus on mind-muscle connection.",
    "Track your weights to ensure progressive overload.",
  ],
  conditioning: [
    "Stay hydrated throughout.",
    "Focus on quality of movement over pure speed.",
  ],
};

export function ExerciseAccordion({
  exercise,
  index,
  isInGroup: _isInGroup,
  isExpanded: controlledExpanded,
  isPlaying = false,
  onToggleExpand,
  onPlayPress,
  testID = "program-detail",
}: ExerciseAccordionProps) {
  const { colors, tint, isDark } = useThemeTokens();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<AccordionTab>("video");

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const handleVideoClick = () => {
    setActiveTab("video");
    if (!isExpanded) {
      handleToggle();
    }
    onPlayPress?.();
  };

  const repsText = exercise.reps ? `${exercise.reps} ${exercise.repsUnit ?? "reps"}` : "";
  const setsReps = exercise.sets ? `${exercise.sets} sets${repsText ? ` · ${repsText}` : ""}` : repsText;
  const hasPrescription = Boolean(setsReps || exercise.rest);

  const tabs: { key: AccordionTab; label: string }[] = [
    { key: "video", label: "Video" },
    { key: "instructions", label: "Instructions" },
    { key: "tips", label: "Tips" },
  ];

  const exType = exercise.type || "strength";
  const instructions = exercise.details
    ? [exercise.details]
    : DEFAULT_INSTRUCTIONS[exType] || DEFAULT_INSTRUCTIONS.strength!;

  const tips = exercise.tip
    ? [exercise.tip]
    : DEFAULT_TIPS[exType] || DEFAULT_TIPS.strength!;

  return (
    <View
      testID={`${testID}-exercise-${exercise.slug}`}
      style={{
        borderRadius: 12,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      {/* Header Row */}
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name} details, ${isExpanded ? "expanded" : "collapsed"}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          padding: 16,
        }}
      >
        {/* Exercise number — ALWAYS a filled number circle, never a thumbnail
            square: the web numbers every row the same way regardless of
            whether the exercise carries a thumbnail (that image only shows up
            inside the expanded video tab). */}
        <View
          testID={`${testID}-exercise-number-${exercise.slug}`}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.success,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors["primary-foreground"] }}>
            {index + 1}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            testID={`${testID}-exercise-name-${exercise.slug}`}
            style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}
          >
            {exercise.name}
          </Text>
          {exercise.type === "conditioning" && exercise.details ? (
            <Text
              style={{ fontSize: 13, color: colors["muted-foreground"], marginTop: 2 }}
            >
              {exercise.details}
            </Text>
          ) : hasPrescription ? (
            <Text style={{ fontSize: 13, color: colors["muted-foreground"], marginTop: 2 }}>
              {exercise.sets ? `${exercise.sets} ${exercise.sets === 1 ? "set" : "sets"}` : null}
              {exercise.sets && exercise.reps ? (
                <Text style={{ color: isDark ? "#52525b" : "#d4d4d8" }}> • </Text>
              ) : null}
              {exercise.reps ? `${exercise.reps} ${exercise.repsUnit ?? "reps"}` : null}
              {exercise.rest ? (
                <>
                  <Text style={{ color: isDark ? "#52525b" : "#d4d4d8" }}> • </Text>
                  <Text style={{ color: colors.success }}>{exercise.rest} rest</Text>
                </>
              ) : null}
            </Text>
          ) : null}
          {exercise.type !== "conditioning" && exercise.details && !isExpanded ? (
            <Text
              numberOfLines={1}
              style={{ fontSize: 12, color: colors["muted-foreground"], marginTop: 2 }}
            >
              {exercise.details}
            </Text>
          ) : null}
        </View>

        {/* Play/demo button — ALWAYS rendered (web shows it on every row and
            opens the video tab even when there is no demo yet; FramedVideo
            draws its own "demo is coming" placeholder in that case), grey by
            default to match the web's `bg-zinc-100 text-zinc-400`. */}
        <Pressable
          testID={`${testID}-exercise-demo-${exercise.slug}`}
          accessibilityLabel={`${exercise.name} demo video`}
          accessibilityRole="button"
          onPress={(e) => {
            e?.stopPropagation?.();
            handleVideoClick();
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isPlaying ? tint("success", 0.2) : colors.muted,
          }}
        >
          <Play
            size={14}
            color={isPlaying ? colors.success : colors["muted-foreground"]}
            fill={isPlaying ? colors.success : colors["muted-foreground"]}
          />
        </Pressable>

        <View style={{ padding: 4 }}>
          {isExpanded ? (
            <ChevronUp size={18} color={colors["muted-foreground"]} />
          ) : (
            <ChevronDown size={18} color={colors["muted-foreground"]} />
          )}
        </View>
      </Pressable>

      {/* Expanded Accordion Body */}
      {isExpanded ? (
        <View
          testID={`${testID}-exercise-expanded-${exercise.slug}`}
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            padding: 12,
            gap: 12,
          }}
        >
          {/* Tab Navigation */}
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {tabs.map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  testID={`${testID}-exercise-tab-${tab.key}`}
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    alignItems: "center",
                    borderBottomWidth: 2,
                    borderBottomColor: isSelected ? colors.primary : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: isSelected ? "700" : "500",
                      color: isSelected ? colors.primary : colors["muted-foreground"],
                    }}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Tab Content */}
          {activeTab === "video" ? (
            <View testID={`${testID}-exercise-video-container-${exercise.slug}`}>
              <FramedVideo
                src={exercise.videoUrl}
                thumbnailUrl={exercise.thumbnailUrl}
                surface="preview"
                exerciseName={exercise.name}
                videoWidth={exercise.videoWidth}
                videoHeight={exercise.videoHeight}
                videoFraming={exercise.videoFraming}
                videoTrim={exercise.videoTrim}
                isPlaying={isPlaying}
                onPlayPress={onPlayPress}
                testID={`${testID}-exercise-video-${exercise.slug}`}
              />
            </View>
          ) : null}

          {activeTab === "instructions" ? (
            <View testID={`${testID}-exercise-instructions-${exercise.slug}`} style={{ gap: 6 }}>
              {instructions.map((step, idx) => (
                <View key={idx} style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "700" }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, lineHeight: 18 }}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {activeTab === "tips" ? (
            <View testID={`${testID}-exercise-tips-${exercise.slug}`} style={{ gap: 6 }}>
              {tips.map((tipText, idx) => (
                <View key={idx} style={{ flexDirection: "row", gap: 8 }}>
                  <Dumbbell size={14} color={colors.primary} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, lineHeight: 18 }}>
                    {tipText}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default ExerciseAccordion;
