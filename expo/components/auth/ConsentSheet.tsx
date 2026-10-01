import { useCallback } from "react";
import {
  Modal as RNModal,
  View,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { modalAnimation, useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/programs/browserLauncher";
import { LEGAL_BASE_URL } from "@/components/legal/LegalLinks";
import {
  AI_CONSENT_DECLINE_NOTE,
  AI_CONSENT_SENDS,
  AI_CONSENT_SENDS_INTRO,
  AI_CONSENT_STATEMENT,
  AI_PROVIDER,
  AI_PROVIDER_ROUTE,
  CONSENT_STATEMENT,
  HEALTH_DISCLAIMER_SHORT,
  LEGAL_MINIMUM_AGE,
  consentButtonLabel,
  consentStandfirst,
  consentTitle,
} from "@become/core";

export interface ConsentSheetProps {
  /** Whether the sheet/modal is visible. Defaults to true. */
  visible?: boolean;
  /** Whether the Terms and age checkbox is checked. */
  checked: boolean;
  /** Callback when Terms checkbox toggles. */
  onCheckedChange: (checked: boolean) => void;
  /** Callback when Agree button is pressed. */
  onAgree: () => void;
  /** Whether the submission is in flight. */
  busy?: boolean;
  /** Error message to display, if any. */
  error?: string | null;
  /** Draw the Terms/age tick. False when terms are already accepted. Default: true. */
  showTerms?: boolean;
  /** Draw the AI permission tick and disclosure. False when already decided. Default: true. */
  showAi?: boolean;
  /** Whether the AI checkbox is checked. Default: false. */
  aiChecked?: boolean;
  /** Callback when AI checkbox toggles. */
  onAiCheckedChange?: (checked: boolean) => void;
  /** Custom AI provider name from refusal/status response (e.g. "Google Gemini"). */
  provider?: string;
  /** Callback when modal is dismissed/closed (Android back or cancel). */
  onClose?: () => void;
  /** Browser launcher for in-app browser links (pluggable for tests). */
  launcher?: BrowserLauncher;
  /** Test ID for the outer container. Default: 'consent-gate'. */
  testID?: string;
}

/**
 * Pure presentation sheet for the Native Consent Gate (NP-045).
 * Mirrors webapp/components/ConsentSheet.tsx:
 *   - Terms and age tick is REQUIRED (blocks continue button).
 *   - AI consent tick is OPTIONAL but answering is required (cannot skip).
 *   - Terms & Privacy links open in-app browser via launcher so tick survives.
 *   - Non-dismissible full-screen modal sheet.
 */
export function ConsentSheet({
  visible = true,
  checked,
  onCheckedChange,
  onAgree,
  busy = false,
  error = null,
  showTerms = true,
  showAi = true,
  aiChecked = false,
  onAiCheckedChange,
  provider,
  onClose,
  launcher = defaultBrowserLauncher,
  testID = "consent-gate",
}: ConsentSheetProps) {
  const { colors } = useThemeTokens();
  const reduceMotion = useReducedMotion();

  const effectiveProvider = provider || AI_PROVIDER;
  const title = consentTitle(showTerms);
  const standfirst = showTerms
    ? consentStandfirst(showTerms)
    : `Become uses AI for some of its work, and that means sending what you submit to ${effectiveProvider}. We will not do that until you say we can.`;
  const buttonLabel = consentButtonLabel({ busy, showTerms, aiChecked });

  const aiStatement = provider
    ? `I agree to share my meal photos, workout inputs, Mind session reflections and coach chat text with ${effectiveProvider}.`
    : AI_CONSENT_STATEMENT;
  const sendsIntro = provider
    ? `What gets sent to ${effectiveProvider}, through ${AI_PROVIDER_ROUTE}:`
    : AI_CONSENT_SENDS_INTRO;

  const onOpenLink = useCallback(
    (path: string) => {
      const url = `${LEGAL_BASE_URL}${path}`;
      void launcher(url);
    },
    [launcher],
  );

  return (
    <RNModal
      visible={visible}
      onRequestClose={() => {
        onClose?.();
      }}
      transparent={false}
      animationType={modalAnimation("slide", reduceMotion)}
      testID={testID}
      accessibilityViewIsModal
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <ScrollView
          testID={`${testID}-scroll`}
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            testID={`${testID}-title`}
            accessibilityRole="header"
            className="text-foreground text-2xl font-bold"
          >
            {title}
          </Text>
          <Text
            testID={`${testID}-standfirst`}
            className="mt-2 text-muted-foreground text-sm leading-relaxed"
          >
            {standfirst}
          </Text>

          {showTerms && (
            <View
              testID="consent-gate-terms-block"
              className="mt-5 rounded-xl border border-border p-3.5 bg-card"
            >
              <Pressable
                testID="consent-gate-checkbox"
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={CONSENT_STATEMENT}
                onPress={() => onCheckedChange(!checked)}
                style={{ minHeight: 44 }}
                className="flex-row items-start gap-3"
              >
                <View
                  className={`h-5 w-5 mt-0.5 rounded border items-center justify-center ${
                    checked
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  }`}
                >
                  {checked && (
                    <Check
                      size={14}
                      color={colors.background}
                      strokeWidth={3}
                    />
                  )}
                </View>
                <Text className="text-foreground text-sm leading-relaxed flex-1">
                  I am at least {LEGAL_MINIMUM_AGE} years old, and I agree to the{" "}
                  <Text
                    testID="consent-terms-link"
                    accessibilityRole="link"
                    accessibilityLabel="Terms of Service"
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      void onOpenLink("/terms");
                    }}
                    className="font-medium text-foreground underline"
                  >
                    Terms of Service
                  </Text>
                  {" and the "}
                  <Text
                    testID="consent-privacy-link"
                    accessibilityRole="link"
                    accessibilityLabel="Privacy Policy"
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      void onOpenLink("/privacy");
                    }}
                    className="font-medium text-foreground underline"
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </Pressable>
            </View>
          )}

          {showAi && (
            <View
              testID="ai-consent-block"
              className="mt-4 rounded-xl border border-border p-3.5 bg-card"
            >
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Optional
              </Text>
              <Pressable
                testID="ai-consent-checkbox"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: aiChecked }}
                accessibilityLabel={aiStatement}
                onPress={() => onAiCheckedChange?.(!aiChecked)}
                style={{ minHeight: 44 }}
                className="mt-2 flex-row items-start gap-3"
              >
                <View
                  className={`h-5 w-5 mt-0.5 rounded border items-center justify-center ${
                    aiChecked
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  }`}
                >
                  {aiChecked && (
                    <Check
                      size={14}
                      color={colors.background}
                      strokeWidth={3}
                    />
                  )}
                </View>
                <Text className="text-foreground text-sm leading-relaxed flex-1">
                  {aiStatement}
                </Text>
              </Pressable>
              <Text className="mt-2.5 text-muted-foreground text-xs font-medium">
                {sendsIntro}
              </Text>
              <View className="mt-1.5 pl-2 space-y-1">
                {AI_CONSENT_SENDS.map((item) => (
                  <Text
                    key={item}
                    className="text-muted-foreground text-xs leading-relaxed"
                  >
                    {"• "}
                    {item}
                  </Text>
                ))}
              </View>
              <Text className="mt-2.5 text-muted-foreground text-xs leading-relaxed">
                {AI_CONSENT_DECLINE_NOTE}{" "}
                <Text
                  testID="ai-consent-privacy-link"
                  accessibilityRole="link"
                  accessibilityLabel="Privacy Policy, section 7"
                  onPress={() => onOpenLink("/privacy#ai")}
                  className="font-medium text-foreground underline"
                >
                  Privacy Policy, section 7
                </Text>
                .
              </Text>
            </View>
          )}

          <Text
            testID="consent-gate-health-disclaimer"
            className="mt-4 text-muted-foreground text-xs leading-relaxed"
          >
            {HEALTH_DISCLAIMER_SHORT}
          </Text>

          {error ? (
            <Text
              testID="consent-gate-error"
              accessibilityRole="alert"
              className="mt-3 text-destructive text-sm"
            >
              {error}
            </Text>
          ) : null}

          <View className="mt-6">
            <Button
              testID="consent-gate-agree"
              variant="primary"
              size="lg"
              onPress={onAgree}
              disabled={(showTerms && !checked) || busy}
              loading={busy}
              accessibilityLabel={buttonLabel}
            >
              {buttonLabel}
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    </RNModal>
  );
}
