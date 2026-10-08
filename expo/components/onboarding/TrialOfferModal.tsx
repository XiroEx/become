// The post-onboarding trial offer — the CTA the card asks for, between
// finishing onboarding and the dashboard's first-run tour (NP-129).
//
// WHY A SEPARATE SURFACE FROM UpgradeSheet / the plan page. Both of those are
// described (AGENTS.md) as: the sheet is REACTIVE (something was refused),
// the plan page is PROACTIVE (the whole comparison, prices included). This is
// a THIRD kind — a one-time, unprompted ask at a single moment in the account's
// life — and it is the one place in the app that offers an actual Stripe trial
// rather than an immediate charge. `trial: true` on the checkout request is
// this surface's alone; every other caller still starts a paid period on day
// one. See lib/billing/trial.ts for why that is safe to repeat.
//
// THE POINT, per the card: a member ACTIVATES Plus by choosing it here, with a
// billing period picked up front and an explicit tick — never an automatic
// grant. "Continue free" is exactly as easy to press as the trial button, and
// nothing about the free path is worse than it is today.
//
// BAILS SILENTLY in any state where there is nothing honest to offer: a member
// who is already Plus, a trial already spent, checkout not known to work, or
// the entitlements read failing outright. "Bail" means render nothing AND call
// onDismiss — this surface has no route of its own, so skipping it is what lets
// the onboarding page move on to /(tabs)/dashboard.
//
// It does NOT bail on `enforced === false`. That is the one rule a BILLING
// control in this app breaks on purpose, and the reasoning (plus the bug the
// first cut of this card shipped) lives with the predicate in
// lib/billing/trial.ts#trialOfferDue. Both the effect and the render read that
// one function rather than restating the condition.
//
// NP-052 COMPLIANCE:
// Plus purchases on native leave the app (App Review 3.1.1(a)). All URLs leave
// through openExternally (Linking.openURL) and NEVER through expo-web-browser.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Check, Gift, Sparkles } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useEntitlements } from "@/lib/entitlements";
import { PLUS_BENEFITS, PLAN_PRICING, renewalLine } from "@become/core";
import type { BillingPlan } from "@become/api-client";
import { trialOfferDue, type TrialOfferSnapshot } from "@/lib/billing/trial";
import {
  CONTINUE_FREE_LABEL,
  TERMS_REFUND_HREF,
  TRIAL_AGREEMENT_TEXT,
  TRIAL_CTA_LABEL,
  TRIAL_OFFER_DETAIL,
  TRIAL_OFFER_HEADING,
  TRIAL_OFFER_SUBHEADING,
} from "@/lib/billing/trialOfferCopy";
import {
  CheckoutAction,
  openBillingPortal,
  openExternally,
  PORTAL_PATH,
  startCheckout,
  type BillingDeps,
  type CheckoutState,
  type PortalState,
} from "@/lib/entitlements/billing";
import { rememberBillingHandover } from "@/lib/entitlements/billingReturn";

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
  deps?: BillingDeps;
  testID?: string;
}

/**
 * The offer itself — pure and props-driven. Every reachable state renders here
 * with no network call.
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
  deps,
  testID = "trial-offer",
}: TrialOfferCardProps) {
  const { colors } = useThemeTokens();
  const live = checkout === "ready" || checkout === "starting";

  return (
    <View style={{ gap: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: "rgba(147, 51, 234, 0.12)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Gift size={20} color="#9333ea" />
        </View>
        <Text
          accessibilityRole="header"
          testID={`${testID}-heading`}
          className="text-foreground text-lg font-bold"
        >
          {TRIAL_OFFER_HEADING}
        </Text>
      </View>

      <Text
        testID={`${testID}-subheading`}
        className="text-muted-foreground text-sm leading-5"
      >
        {TRIAL_OFFER_SUBHEADING}
      </Text>

      {/* Benefits */}
      <View style={{ gap: 8 }}>
        {PLUS_BENEFITS.map((benefit) => (
          <View
            key={benefit}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border ?? "rgba(255,255,255,0.1)",
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: "rgba(147, 51, 234, 0.15)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={13} color="#9333ea" />
            </View>
            <Text className="text-foreground text-sm font-medium flex-1">
              {benefit}
            </Text>
          </View>
        ))}
      </View>

      {live && (
        <>
          {/* Billing period choices, picked BEFORE the trial starts */}
          <View
            accessibilityRole="radiogroup"
            aria-label="Billing period"
            style={{ flexDirection: "row", gap: 8 }}
          >
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: plan === "monthly" }}
              testID={`${testID}-plan-monthly`}
              onPress={() => onPlanChange("monthly")}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                borderWidth: plan === "monthly" ? 2 : 1,
                borderColor:
                  plan === "monthly"
                    ? "#9333ea"
                    : colors.border ?? "rgba(255,255,255,0.1)",
                backgroundColor:
                  plan === "monthly"
                    ? "rgba(147, 51, 234, 0.08)"
                    : "transparent",
              }}
            >
              <Text className="text-foreground text-sm font-semibold">
                {PLAN_PRICING.monthly.display}
                <Text className="text-muted-foreground font-normal">
                  {" "}
                  / {PLAN_PRICING.monthly.per}
                </Text>
              </Text>
              <Text className="text-muted-foreground text-xs mt-1">
                after the trial
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: plan === "annual" }}
              testID={`${testID}-plan-annual`}
              onPress={() => onPlanChange("annual")}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                borderWidth: plan === "annual" ? 2 : 1,
                borderColor:
                  plan === "annual"
                    ? "#9333ea"
                    : colors.border ?? "rgba(255,255,255,0.1)",
                backgroundColor:
                  plan === "annual"
                    ? "rgba(147, 51, 234, 0.08)"
                    : "transparent",
              }}
            >
              <Text className="text-foreground text-sm font-semibold">
                {PLAN_PRICING.annual.display}
                <Text className="text-muted-foreground font-normal">
                  {" "}
                  / {PLAN_PRICING.annual.per}
                </Text>
              </Text>
              <Text style={{ color: "#9333ea" }} className="text-xs font-medium mt-1">
                Save {PLAN_PRICING.annual.savesPercentDisplay}
              </Text>
            </Pressable>
          </View>

          {/* Trial detail and renewal line */}
          <Text
            testID={`${testID}-detail`}
            className="text-muted-foreground text-xs leading-5"
          >
            {TRIAL_OFFER_DETAIL}
          </Text>
          <Text
            testID={`${testID}-renewal`}
            className="text-muted-foreground text-[11px] leading-4"
          >
            {renewalLine(plan)}
          </Text>

          {/* Agreement checkbox */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            testID={`${testID}-agreement`}
            onPress={() => onAgreedChange(!agreed)}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
              marginTop: 4,
            }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: agreed ? "#9333ea" : colors.border ?? "#888",
                backgroundColor: agreed ? "#9333ea" : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 2,
              }}
            >
              {agreed && <Check size={12} color="#ffffff" />}
            </View>
            <Text className="text-muted-foreground text-xs leading-5 flex-1">
              {TRIAL_AGREEMENT_TEXT}{" "}
              <Text
                style={{ color: "#9333ea", textDecorationLine: "underline" }}
                onPress={() => void openExternally(TERMS_REFUND_HREF, deps)}
              >
                Full terms
              </Text>
              .
            </Text>
          </Pressable>

          {/* Start trial CTA */}
          <Button
            size="lg"
            variant="primary"
            testID={`${testID}-start`}
            disabled={!agreed || checkout === "starting"}
            loading={checkout === "starting"}
            onPress={onStart}
            icon={checkout === "starting" ? undefined : <Sparkles size={16} color="#ffffff" />}
            accessibilityLabel={TRIAL_CTA_LABEL}
          >
            {TRIAL_CTA_LABEL}
          </Button>
        </>
      )}

      {/* Non-purchasable state (error, fix-payment, already-plus) */}
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

      {/* Continue free */}
      <Button
        size="md"
        variant="ghost"
        testID={`${testID}-continue-free`}
        onPress={onContinueFree}
        accessibilityLabel={CONTINUE_FREE_LABEL}
      >
        {CONTINUE_FREE_LABEL}
      </Button>
    </View>
  );
}

export interface TrialOfferModalProps {
  onDismiss: () => void;
  snapshot?: TrialOfferSnapshot | null;
  loading?: boolean;
  deps?: BillingDeps;
  testID?: string;
}

/**
 * Stateful modal wrapper. Mounted by expo/app/onboarding.tsx right after the
 * profile save succeeds and before it would otherwise have pushed to
 * /(tabs)/dashboard.
 */
export function TrialOfferModal({
  onDismiss,
  snapshot,
  loading: loadingProp,
  deps = {},
  testID = "trial-offer-modal",
}: TrialOfferModalProps) {
  const entitlements = useEntitlements();
  const data = snapshot !== undefined ? snapshot : entitlements.data;
  const loading = loadingProp !== undefined ? loadingProp : entitlements.loading;

  const [plan, setPlan] = useState<BillingPlan>("monthly");
  const [agreed, setAgreed] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState>("ready");
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [portalPath, setPortalPath] = useState<string>(PORTAL_PATH);
  const [browserOpened, setBrowserOpened] = useState(false);

  /** The offer is answered at most once. */
  const answered = useRef(false);
  const answer = useCallback(() => {
    if (answered.current) return;
    answered.current = true;
    onDismiss();
  }, [onDismiss]);

  // Nothing honest to offer — see trialOfferDue().
  useEffect(() => {
    if (loading) return;
    if (!trialOfferDue(data)) answer();
  }, [loading, data, answer]);

  const onStart = useCallback(() => {
    if (checkout !== "ready" && checkout !== "error") return;
    setCheckout("starting");
    void (async () => {
      const result = await startCheckout({ ...deps, plan, trial: true });
      if (result.kind === "state") {
        if (result.portalPath) setPortalPath(result.portalPath);
        setCheckout(result.state);
        return;
      }
      const opened = await openExternally(result.url, deps);
      setCheckout(opened ? "ready" : "error");
      if (opened) {
        rememberBillingHandover("checkout");
        setBrowserOpened(true);
      }
    })();
  }, [checkout, deps, plan]);

  const onOpenPortal = useCallback(() => {
    setPortalState("opening");
    void openBillingPortal(portalPath, deps).then((opened) => {
      setPortalState(opened ? "idle" : "failed");
    });
  }, [portalPath, deps]);

  if (loading) return null;
  if (!trialOfferDue(data)) return null;

  return (
    <Modal
      visible={true}
      onClose={answer}
      testID={testID}
      accessibilityLabel={TRIAL_OFFER_HEADING}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <TrialOfferCard
          plan={plan}
          onPlanChange={setPlan}
          agreed={agreed}
          onAgreedChange={setAgreed}
          checkout={checkout}
          portalState={portalState}
          browserOpened={browserOpened}
          onStart={onStart}
          onOpenPortal={onOpenPortal}
          onContinueFree={answer}
          deps={deps}
          testID={testID}
        />
      </ScrollView>
    </Modal>
  );
}

export default TrialOfferModal;
