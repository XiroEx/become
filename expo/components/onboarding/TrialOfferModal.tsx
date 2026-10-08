/**
 * ─── THE POST-ONBOARDING TRIAL OFFER (NP-129) ──────────────────────────────────
 *
 * Native port of `webapp/components/onboarding/TrialOfferModal.tsx`.
 *
 * Presented right after profile save and before /dashboard — between onboarding
 * and the dashboard's first-run tour.
 *
 * NP-052 EXTERNAL PURCHASE RULES:
 *   - Plus is sold from native iOS only via external link on the US storefront
 *     (App Review 3.1.1(a)). Handed to `openExternally` (Linking.openURL, Safari on iOS /
 *     Chrome on Android), and NEVER an in-app browser.
 *   - returnTo is 'app' (NP-051) through startCheckout in lib/entitlements/billing.ts.
 *   - The member is informed that checkout continues in the browser.
 *
 * BAILS SILENTLY when there is nothing honest to offer (already Plus, spent trial,
 * checkout not configured, or entitlements fetch failure): calls onDismiss and renders null.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { Check, Gift, Sparkles, ExternalLink } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { PLUS_BENEFITS, useEntitlements } from "@/lib/entitlements";
import { PLAN_PRICING, renewalLine } from "@become/core";
import type { BillingPlan } from "@become/api-client";
import {
  CheckoutAction,
  CHECKOUT_OPENED_NOTE,
  CHECKOUT_WEB_NOTE,
} from "@/components/entitlements/UpgradeSheet";
import {
  PORTAL_PATH,
  openBillingPortal,
  openExternally,
  startCheckout,
  type BillingDeps,
  type CheckoutState,
  type PortalState,
} from "@/lib/entitlements/billing";
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
    <View testID={testID}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          testID={`${testID}-icon`}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: colors.muted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Gift size={20} color={colors.primary} />
        </View>
        <Text
          testID={`${testID}-heading`}
          accessibilityRole="header"
          className="text-foreground text-lg font-bold flex-1"
          style={WRAPPABLE_TEXT}
        >
          {TRIAL_OFFER_HEADING}
        </Text>
      </View>

      <Text
        testID={`${testID}-subheading`}
        className="text-muted-foreground mt-2 text-sm leading-relaxed"
        style={WRAPPABLE_TEXT}
      >
        {TRIAL_OFFER_SUBHEADING}
      </Text>

      {/* Benefits */}
      <View style={{ marginTop: 16, gap: 8 }}>
        {PLUS_BENEFITS.map((benefit, index) => (
          <View
            key={benefit}
            testID={`${testID}-benefit-${index}`}
            className="border-border flex-row items-start gap-3 rounded-xl border p-3"
          >
            <View style={{ marginTop: 2 }}>
              <Check size={14} color={colors.primary} />
            </View>
            <Text
              className="text-foreground text-sm font-medium flex-1"
              style={WRAPPABLE_TEXT}
            >
              {benefit}
            </Text>
          </View>
        ))}
      </View>

      {live && (
        <>
          {/* Plan picker - monthly vs annual */}
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Billing period"
            style={{ flexDirection: "row", gap: 8, marginTop: 16 }}
          >
            <Pressable
              testID={`${testID}-plan-monthly`}
              accessibilityRole="radio"
              accessibilityState={{ checked: plan === "monthly" }}
              accessibilityLabel={`${PLAN_PRICING.monthly.display} per ${PLAN_PRICING.monthly.per} after the trial`}
              onPress={() => onPlanChange("monthly")}
              style={[
                minTouchTarget,
                {
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor:
                    plan === "monthly" ? colors.primary : colors.border,
                  backgroundColor:
                    plan === "monthly" ? colors.muted : "transparent",
                  padding: 12,
                },
              ]}
            >
              <Text
                className="text-foreground text-sm font-semibold"
                style={WRAPPABLE_TEXT}
              >
                {PLAN_PRICING.monthly.display}
                <Text className="text-muted-foreground text-xs font-normal">
                  {" "}
                  / {PLAN_PRICING.monthly.per}
                </Text>
              </Text>
              <Text
                className="text-muted-foreground mt-1 text-xs"
                style={WRAPPABLE_TEXT}
              >
                after the trial
              </Text>
            </Pressable>

            <Pressable
              testID={`${testID}-plan-annual`}
              accessibilityRole="radio"
              accessibilityState={{ checked: plan === "annual" }}
              accessibilityLabel={`${PLAN_PRICING.annual.display} per ${PLAN_PRICING.annual.per}, Save ${PLAN_PRICING.annual.savesPercentDisplay}`}
              onPress={() => onPlanChange("annual")}
              style={[
                minTouchTarget,
                {
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor:
                    plan === "annual" ? colors.primary : colors.border,
                  backgroundColor:
                    plan === "annual" ? colors.muted : "transparent",
                  padding: 12,
                },
              ]}
            >
              <Text
                className="text-foreground text-sm font-semibold"
                style={WRAPPABLE_TEXT}
              >
                {PLAN_PRICING.annual.display}
                <Text className="text-muted-foreground text-xs font-normal">
                  {" "}
                  / {PLAN_PRICING.annual.per}
                </Text>
              </Text>
              <Text
                className="text-primary mt-1 text-xs font-medium"
                style={WRAPPABLE_TEXT}
              >
                Save {PLAN_PRICING.annual.savesPercentDisplay}
              </Text>
            </Pressable>
          </View>

          {/* Details & Renewal */}
          <Text
            testID={`${testID}-detail`}
            className="text-muted-foreground mt-3 text-xs leading-relaxed"
            style={WRAPPABLE_TEXT}
          >
            {TRIAL_OFFER_DETAIL}
          </Text>
          <Text
            testID={`${testID}-renewal`}
            className="text-muted-foreground mt-2 text-xs leading-snug"
            style={WRAPPABLE_TEXT}
          >
            {renewalLine(plan)}
          </Text>

          {/* Agreement Checkbox */}
          <Pressable
            testID={`${testID}-agreement`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel={`${TRIAL_AGREEMENT_TEXT} Full terms.`}
            onPress={() => onAgreedChange(!agreed)}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
              marginTop: 16,
            }}
          >
            <View
              testID={`${testID}-checkbox`}
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: agreed ? colors.primary : colors.border,
                backgroundColor: agreed ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 2,
              }}
            >
              {agreed ? (
                <Check size={14} color={colors["primary-foreground"]} />
              ) : null}
            </View>
            <Text
              className="text-muted-foreground text-xs leading-relaxed"
              style={[WRAPPABLE_TEXT, { flex: 1 }]}
            >
              {TRIAL_AGREEMENT_TEXT}{" "}
              <Text
                testID={`${testID}-terms-link`}
                accessibilityRole="link"
                className="text-foreground font-medium underline"
                onPress={() => {
                  void Linking.openURL(`${WEBAPP_BASE_URL}${TERMS_REFUND_HREF}`);
                }}
              >
                Full terms
              </Text>
              .
            </Text>
          </Pressable>

          {/* CTA Button */}
          <View style={{ marginTop: 16, gap: 8 }}>
            <Button
              testID={`${testID}-cta`}
              onPress={onStart}
              disabled={!agreed || checkout === "starting"}
              loading={checkout === "starting"}
              size="lg"
              icon={<Sparkles size={16} color={colors["primary-foreground"]} />}
              accessibilityLabel={TRIAL_CTA_LABEL}
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
                  browserOpened ? `${testID}-cta-opened` : `${testID}-cta-note`
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

      <View style={{ marginTop: 12 }}>
        <Button
          testID={`${testID}-continue-free`}
          onPress={onContinueFree}
          variant="ghost"
          size="md"
          accessibilityLabel={CONTINUE_FREE_LABEL}
        >
          {CONTINUE_FREE_LABEL}
        </Button>
      </View>
    </View>
  );
}

export interface TrialOfferModalProps {
  onDismiss: () => void;
  deps?: BillingDeps;
  testID?: string;
}

const NO_DEPS: BillingDeps = {};

export function TrialOfferModal({
  onDismiss,
  deps = NO_DEPS,
  testID = "trial-offer-modal",
}: TrialOfferModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const { data, loading } = useEntitlements();
  const [plan, setPlan] = useState<BillingPlan>("monthly");
  const [agreed, setAgreed] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState>("ready");
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [portalPath, setPortalPath] = useState<string>(PORTAL_PATH);
  const [browserOpened, setBrowserOpened] = useState(false);

  const answered = useRef(false);
  const answer = useCallback(() => {
    if (answered.current) return;
    answered.current = true;
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (loading) return;
    if (!trialOfferDue(data)) answer();
  }, [loading, data, answer]);

  const onStart = useCallback(() => {
    if (checkout !== "ready" && checkout !== "error") return;
    setCheckout("starting");
    void (async () => {
      const result = await startCheckout(plan, { ...deps, trial: true });
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
  }, [plan, checkout, deps]);

  const onOpenPortal = useCallback(() => {
    setPortalState("opening");
    void openBillingPortal(portalPath, deps).then((opened) => {
      setPortalState(opened ? "idle" : "failed");
      if (opened) rememberBillingHandover("portal");
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
        style={{ maxHeight: windowHeight * 0.85 }}
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
          testID={testID}
        />
      </ScrollView>
    </Modal>
  );
}

export default TrialOfferModal;
