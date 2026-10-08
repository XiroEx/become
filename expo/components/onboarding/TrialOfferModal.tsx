/**
 * ─── POST-ONBOARDING TRIAL OFFER (NP-129) ────────────────────────────────────
 *
 * Native port of `webapp/components/onboarding/TrialOfferModal.tsx`.
 *
 * The one-time CTA after onboarding and before the home dashboard: start a
 * 10-day Plus trial now, or continue free.
 *
 * Follows NP-052 rules for external purchase:
 *   • Starts Stripe Checkout session with `returnTo: 'app'` and `trial: true`.
 *   • Hands the URL to the device browser via `Linking.openURL` / `openExternally`
 *     (Safari on iOS, Chrome on Android; NEVER `expo-web-browser`).
 *   • The external purchase note informs the member that checkout continues
 *     on the Become website.
 *
 * BAILS SILENTLY when there is nothing honest to offer: already Plus, trial
 * already spent, or checkout not configured. Bailing means rendering nothing
 * and calling `onDismiss()` so the onboarding page moves to the dashboard.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Check, ExternalLink, Gift } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { PLUS_BENEFITS, useEntitlements } from "@/lib/entitlements";
import { PLAN_PRICING, renewalLine } from "@become/core";
import type { BillingPlan } from "@become/api-client";
import {
  PORTAL_PATH,
  openBillingPortal,
  openExternally,
  startCheckout,
  type BillingDeps,
  type CheckoutState,
  type PortalState,
} from "@/lib/entitlements/billing";
import {
  CHECKOUT_OPENED_NOTE,
  CHECKOUT_WEB_NOTE,
  CheckoutAction,
} from "@/components/entitlements/UpgradeSheet";
import { rememberBillingHandover } from "@/lib/entitlements/billingReturn";
import { trialOfferDue } from "@/lib/billing/trial";
import {
  CONTINUE_FREE_LABEL,
  TERMS_REFUND_HREF,
  TRIAL_AGREEMENT_TEXT,
  TRIAL_CTA_LABEL,
  TRIAL_OFFER_DETAIL,
  TRIAL_OFFER_HEADING,
  TRIAL_OFFER_SUBHEADING,
} from "@/lib/billing/trialOfferCopy";

export interface TrialOfferCardProps {
  plan: BillingPlan;
  onPlanChange: (plan: BillingPlan) => void;
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  checkout: CheckoutState;
  portalState: PortalState;
  browserOpened?: boolean;
  onStart: () => void;
  onOpenPortal: () => void;
  onContinueFree: () => void;
  testID?: string;
}

/**
 * Pure and props-driven representation of the trial offer.
 * Mirrors `TrialOfferCard` from `webapp/components/onboarding/TrialOfferModal.tsx`.
 */
export function TrialOfferCard({
  plan,
  onPlanChange,
  agreed,
  onAgreedChange,
  checkout,
  portalState,
  browserOpened = false,
  onStart,
  onOpenPortal,
  onContinueFree,
  testID = "trial-offer",
}: TrialOfferCardProps) {
  const { colors } = useThemeTokens();
  const live = checkout === "ready" || checkout === "starting";

  return (
    <View testID={testID} className="px-5 pt-4 pb-6">
      {/* Header */}
      <View className="flex-row items-center gap-2.5">
        <View className="bg-purple-600/10 h-9 w-9 items-center justify-center rounded-xl">
          <Gift size={20} color={colors.primary} />
        </View>
        <Text
          testID={`${testID}-heading`}
          className="text-foreground text-lg font-bold"
          style={WRAPPABLE_TEXT}
        >
          {TRIAL_OFFER_HEADING}
        </Text>
      </View>

      <Text
        testID={`${testID}-subheading`}
        className="text-muted-foreground mt-2 text-sm"
        style={WRAPPABLE_TEXT}
      >
        {TRIAL_OFFER_SUBHEADING}
      </Text>

      {/* Benefits */}
      <View className="mt-4 gap-2">
        {PLUS_BENEFITS.map((benefit) => (
          <View
            key={benefit}
            testID={`${testID}-benefit`}
            className="border-border flex-row items-center gap-3 rounded-xl border p-3"
          >
            <View className="bg-purple-100 dark:bg-purple-950/40 h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Check size={14} color={colors.primary} />
            </View>
            <Text
              className="text-foreground text-sm font-medium"
              style={WRAPPABLE_TEXT}
            >
              {benefit}
            </Text>
          </View>
        ))}
      </View>

      {live && (
        <>
          {/* Plan selector (radiogroup) */}
          <View
            testID={`${testID}-radiogroup`}
            accessibilityRole="radiogroup"
            accessibilityLabel="Billing period"
            style={{ flexDirection: "row", gap: 8, marginTop: 16 }}
          >
            <Pressable
              testID={`${testID}-plan-monthly`}
              accessibilityRole="radio"
              accessibilityState={{ checked: plan === "monthly" }}
              accessibilityLabel={`Monthly, ${PLAN_PRICING.monthly.display} per month after the trial`}
              onPress={() => onPlanChange("monthly")}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor:
                  plan === "monthly" ? colors.primary : colors.border,
                backgroundColor:
                  plan === "monthly"
                    ? colors.muted
                    : "transparent",
              }}
            >
              <Text className="text-foreground text-sm font-semibold">
                {PLAN_PRICING.monthly.display}
                <Text className="text-muted-foreground text-xs font-normal">
                  {" "}
                  / {PLAN_PRICING.monthly.per}
                </Text>
              </Text>
              <Text className="text-muted-foreground mt-1 text-xs">
                after the trial
              </Text>
            </Pressable>

            <Pressable
              testID={`${testID}-plan-annual`}
              accessibilityRole="radio"
              accessibilityState={{ checked: plan === "annual" }}
              accessibilityLabel={`Annual, ${PLAN_PRICING.annual.display} per year, save ${PLAN_PRICING.annual.savesPercentDisplay}`}
              onPress={() => onPlanChange("annual")}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor:
                  plan === "annual" ? colors.primary : colors.border,
                backgroundColor:
                  plan === "annual"
                    ? colors.muted
                    : "transparent",
              }}
            >
              <Text className="text-foreground text-sm font-semibold">
                {PLAN_PRICING.annual.display}
                <Text className="text-muted-foreground text-xs font-normal">
                  {" "}
                  / {PLAN_PRICING.annual.per}
                </Text>
              </Text>
              <Text className="text-primary mt-1 text-xs font-medium">
                Save {PLAN_PRICING.annual.savesPercentDisplay}
              </Text>
            </Pressable>
          </View>

          <Text
            testID={`${testID}-detail`}
            className="text-muted-foreground mt-3 text-xs leading-relaxed"
            style={WRAPPABLE_TEXT}
          >
            {TRIAL_OFFER_DETAIL}
          </Text>

          <Text
            testID={`${testID}-renewal`}
            className="text-muted-foreground mt-2 text-[11px] leading-snug"
            style={WRAPPABLE_TEXT}
          >
            {renewalLine(plan)}
          </Text>

          {/* Agreement Checkbox */}
          <Pressable
            testID={`${testID}-agreement-checkbox`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel={TRIAL_AGREEMENT_TEXT}
            onPress={() => onAgreedChange(!agreed)}
            style={[
              minTouchTarget,
              {
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                marginTop: 16,
              },
            ]}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: agreed ? colors.primary : colors["muted-foreground"],
                backgroundColor: agreed ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 2,
              }}
            >
              {agreed ? <Check size={14} color="#ffffff" /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                className="text-muted-foreground text-xs leading-relaxed"
                style={WRAPPABLE_TEXT}
              >
                {TRIAL_AGREEMENT_TEXT}{" "}
                <Text
                  testID={`${testID}-terms-link`}
                  accessibilityRole="link"
                  onPress={() =>
                    void Linking.openURL(`https://becomeurbest.com${TERMS_REFUND_HREF}`)
                  }
                  className="text-foreground font-medium underline"
                >
                  Full terms
                </Text>
                .
              </Text>
            </View>
          </Pressable>

          {/* Start CTA */}
          <View style={{ marginTop: 16, gap: 8 }}>
            <Button
              testID={`${testID}-cta`}
              onPress={onStart}
              disabled={!agreed || checkout === "starting"}
              loading={checkout === "starting"}
              size="lg"
              accessibilityLabel={TRIAL_CTA_LABEL}
              accessibilityHint="Opens your browser to start your trial on the Become website"
            >
              {TRIAL_CTA_LABEL}
            </Button>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <ExternalLink size={14} color={colors["muted-foreground"]} />
              <Text
                testID={
                  browserOpened
                    ? `${testID}-cta-opened`
                    : `${testID}-cta-note`
                }
                style={WRAPPABLE_TEXT}
                className="text-muted-foreground text-xs"
              >
                {browserOpened ? CHECKOUT_OPENED_NOTE : CHECKOUT_WEB_NOTE}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* Refusal states mapped through shared CheckoutAction */}
      {!live && (
        <CheckoutAction
          state={checkout}
          tierName="Plus"
          portalState={portalState}
          browserOpened={browserOpened}
          onStart={onStart}
          onOpenPortal={onOpenPortal}
          testID={testID}
        />
      )}

      {/* Continue Free */}
      <View style={{ marginTop: 12 }}>
        <Button
          testID={`${testID}-continue-free`}
          onPress={onContinueFree}
          variant="ghost"
          size="default"
          accessibilityLabel={CONTINUE_FREE_LABEL}
          accessibilityHint="Continues to dashboard on the free plan"
        >
          {CONTINUE_FREE_LABEL}
        </Button>
      </View>
    </View>
  );
}

export interface TrialOfferModalProps {
  /** Called when the member chooses free, or this surface bails. */
  onDismiss: () => void;
  deps?: BillingDeps;
  testID?: string;
}

/** Stable default so omitting `deps` cannot restart probes. */
const NO_DEPS: BillingDeps = {};

/**
 * Stateful wrapper for the post-onboarding trial offer.
 * Mounted by `expo/app/onboarding.tsx` when onboarding profile save succeeds.
 */
export default function TrialOfferModal({
  onDismiss,
  deps = NO_DEPS,
  testID = "trial-offer",
}: TrialOfferModalProps) {
  const { data, loading } = useEntitlements();
  const [plan, setPlan] = useState<BillingPlan>("monthly");
  const [agreed, setAgreed] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState>("ready");
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [portalPath, setPortalPath] = useState<string>(PORTAL_PATH);
  const [browserOpened, setBrowserOpened] = useState(false);

  /** Latched in a ref so onDismiss is called at most once. */
  const answered = useRef(false);
  const answer = useCallback(() => {
    if (answered.current) return;
    answered.current = true;
    onDismiss();
  }, [onDismiss]);

  // Bail silently if there is nothing honest to offer.
  useEffect(() => {
    if (loading) return;
    if (!trialOfferDue(data)) answer();
  }, [loading, data, answer]);

  const startCheckoutAttempt = useCallback(async () => {
    if (checkout !== "ready" && checkout !== "error") return;
    setCheckout("starting");
    try {
      const result = await startCheckout(plan, { ...deps, trial: true });
      if (result.kind === "url") {
        const opened = await openExternally(result.url, deps);
        if (opened) {
          rememberBillingHandover("checkout");
          setBrowserOpened(true);
          setCheckout("ready");
        } else {
          setCheckout("error");
        }
        return;
      }
      if (result.portalPath) setPortalPath(result.portalPath);
      setCheckout(result.state);
    } catch {
      setCheckout("error");
    }
  }, [plan, checkout, deps]);

  const openPortal = useCallback(async () => {
    setPortalState("opening");
    try {
      const opened = await openBillingPortal(portalPath, deps);
      setPortalState(opened ? "idle" : "failed");
      if (opened) rememberBillingHandover("portal");
    } catch {
      setPortalState("failed");
    }
  }, [portalPath, deps]);

  if (loading) return null;
  if (!trialOfferDue(data)) return null;

  return (
    <BottomSheet
      visible={true}
      onClose={answer}
      testID={testID}
      accessibilityLabel={TRIAL_OFFER_HEADING}
      sheetStyle={{ maxHeight: "92%" }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <TrialOfferCard
          plan={plan}
          onPlanChange={setPlan}
          agreed={agreed}
          onAgreedChange={setAgreed}
          checkout={checkout}
          portalState={portalState}
          browserOpened={browserOpened}
          onStart={startCheckoutAttempt}
          onOpenPortal={openPortal}
          onContinueFree={answer}
          testID={testID}
        />
      </ScrollView>
    </BottomSheet>
  );
}
