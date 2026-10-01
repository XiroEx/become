import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Sparkles,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { ScreenState } from "@/components/ScreenState";
import { LegalLinks, LEGAL_BASE_URL } from "@/components/legal/LegalLinks";
import { ManageBillingButton } from "@/components/billing/ManageBillingButton";
import { CheckoutAction } from "@/components/entitlements/UpgradeSheet";
import { useEntitlements } from "@/lib/entitlements";
import {
  FREE_LIMITS,
  hasManageableBilling,
  tierLabel,
  type EntitlementsSnapshot,
  type Feature,
  type FeatureEntitlement,
} from "@become/core";
import type {
  BillingPlan,
  BillingPlansResponse,
  FreeForeverCopy,
  PlanRowCopy,
} from "@become/api-client";
import {
  PORTAL_PATH,
  fetchBillingPlans,
  fetchBillingStatus,
  openBillingPortal,
  openExternally,
  startCheckout,
  type BillingDeps,
  type BillingStatusResult,
  type CheckoutState,
  type PlanAvailability,
  type PortalState,
} from "@/lib/entitlements/billing";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";

// ─── Usage line helper ───────────────────────────────────────────────────────

/**
 * The member's own usage of one allowance.
 *
 * Reads `canCreate`, NEVER `allowed`. `allowed` is true for a capped free
 * member on purpose so they can edit and delete rows.
 */
export function usageLine(
  ent: FeatureEntitlement | null | undefined,
  row: PlanRowCopy,
): { text: string; atLimit: boolean } | null {
  if (!ent || ent.limit === null || ent.limit <= 0) return null;
  const used = Math.min(Math.max(ent.used, 0), ent.limit);
  const feature = row.feature as Feature;
  const freeLimit = FREE_LIMITS[feature];
  const when =
    freeLimit?.window === "day"
      ? " today"
      : freeLimit?.window === "week"
        ? " this week"
        : "";
  return {
    text: `${used} of ${ent.limit} used${when}`,
    atLimit: ent.canCreate === false,
  };
}

// ─── Just paid ───────────────────────────────────────────────────────────────

export type CheckoutReturnState = "none" | "confirming" | "confirmed";

export function CheckoutConfirmation({
  state,
  isPlus,
  testID = "checkout-confirmation",
}: {
  state: Exclude<CheckoutReturnState, "none">;
  isPlus: boolean;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const confirming = state === "confirming";

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: colors.card,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.muted,
        }}
      >
        {confirming ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Sparkles size={20} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          className="text-foreground text-sm font-semibold"
          style={WRAPPABLE_TEXT}
        >
          {confirming ? "Confirming your payment" : "Payment received"}
        </Text>
        <Text
          className="text-muted-foreground text-xs mt-0.5"
          style={WRAPPABLE_TEXT}
        >
          {confirming
            ? "One moment."
            : isPlus
              ? "Thanks. Everything below is unlocked."
              : "Thanks. Your plan will update here in a moment."}
        </Text>
      </View>
    </View>
  );
}

// ─── Current plan ────────────────────────────────────────────────────────────

export interface CurrentPlanProps {
  snapshot: EntitlementsSnapshot;
  portalState: PortalState;
  onOpenPortal: () => void;
  testID?: string;
}

export function CurrentPlan({
  snapshot,
  portalState,
  onOpenPortal,
  testID = "current-plan-card",
}: CurrentPlanProps) {
  const { colors } = useThemeTokens();
  const isPlus = snapshot.tier !== "free";
  const manageable = hasManageableBilling(snapshot.subscription);
  const periodEnd = snapshot.subscription?.currentPeriodEnd
    ? new Date(snapshot.subscription.currentPeriodEnd)
    : null;
  const endsInstead = snapshot.subscription?.cancelAtPeriodEnd === true;
  const dated = periodEnd && !Number.isNaN(periodEnd.getTime());

  const subtitle = isPlus
    ? snapshot.grandfathered
      ? "Thanks for being here early"
      : dated
        ? `${endsInstead ? "Ends" : "Renews"} ${periodEnd.toLocaleDateString()}`
        : "No limits on anything"
    : "Here is exactly what that includes.";

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      className="bg-card rounded-2xl p-4 border border-border"
      style={{ gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.muted,
          }}
        >
          <Sparkles
            size={20}
            color={isPlus ? colors.primary : colors["muted-foreground"]}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            testID="current-plan-title"
            accessibilityRole="header"
            className="text-foreground text-sm font-semibold"
            style={WRAPPABLE_TEXT}
          >
            {`You're on ${tierLabel(snapshot.tier)}`}
          </Text>
          <Text
            testID="current-plan-subtitle"
            className="text-muted-foreground text-xs mt-0.5"
            style={WRAPPABLE_TEXT}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      {manageable && (
        <ManageBillingButton
          state={portalState}
          onOpenPortal={onOpenPortal}
          showNote={true}
          style={{
            marginTop: 4,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        />
      )}
    </View>
  );
}

// ─── Unenforced plan (kill switch off) ───────────────────────────────────────

export interface UnenforcedPlanProps {
  snapshot: EntitlementsSnapshot;
  portalState: PortalState;
  onOpenPortal: () => void;
  onBackToDashboard?: () => void;
  testID?: string;
}

export function UnenforcedPlan({
  snapshot,
  portalState,
  onOpenPortal,
  onBackToDashboard,
  testID = "unenforced-plan-card",
}: UnenforcedPlanProps) {
  const { colors } = useThemeTokens();
  const manageable = hasManageableBilling(snapshot.subscription);

  return (
    <View
      testID={testID}
      className="bg-card rounded-2xl p-4 border border-border"
      style={{ gap: 12 }}
    >
      <Text
        accessibilityRole="header"
        className="text-foreground text-base font-semibold"
        style={WRAPPABLE_TEXT}
      >
        Everything is open on your account
      </Text>
      <Text
        className="text-muted-foreground text-sm"
        style={WRAPPABLE_TEXT}
      >
        Nothing in Become is limited for you right now, and there is nothing to buy.
      </Text>
      {onBackToDashboard && (
        <Pressable
          testID="unenforced-back-link"
          accessibilityRole="link"
          accessibilityLabel="Back to your dashboard"
          onPress={onBackToDashboard}
          style={[
            minTouchTarget,
            { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
          ]}
        >
          <Text className="text-primary text-sm font-medium" style={WRAPPABLE_TEXT}>
            Back to your dashboard
          </Text>
          <ArrowRight size={16} color={colors.primary} />
        </Pressable>
      )}
      {manageable && (
        <ManageBillingButton
          state={portalState}
          onOpenPortal={onOpenPortal}
          showNote={true}
          style={{
            marginTop: 4,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        />
      )}
    </View>
  );
}

// ─── Plan pricing ───────────────────────────────────────────────────────────

export interface PlanPricingProps {
  plans: BillingPlansResponse["plans"];
  currency: string;
  checkout: CheckoutState;
  available: PlanAvailability;
  portalState: PortalState;
  browserOpened?: boolean;
  startingPlan?: BillingPlan | null;
  onStart: (plan: BillingPlan) => void;
  onOpenPortal: () => void;
  onOpenTerms?: () => void;
  testID?: string;
}

export function PlanPricing({
  plans,
  currency,
  checkout,
  available,
  portalState,
  browserOpened = false,
  startingPlan = null,
  onStart,
  onOpenPortal,
  onOpenTerms,
  testID = "plan-pricing-section",
}: PlanPricingProps) {
  const { colors } = useThemeTokens();
  const live = checkout === "ready" || checkout === "starting";

  const renderCta = (plan: BillingPlan) => {
    if (!live) return null;
    if (!available[plan]) {
      return (
        <Text
          testID={`pricing-not-available-${plan}`}
          className="text-muted-foreground text-xs font-medium text-center mt-3"
          style={WRAPPABLE_TEXT}
        >
          Not available yet.
        </Text>
      );
    }
    const isStartingThis = checkout === "starting" && startingPlan === plan;
    const label = plan === "monthly" ? "Choose monthly" : "Choose annual";
    const renewalDisclosure =
      plan === "monthly" ? plans.monthly.renewalLine : plans.annual.renewalLine;

    return (
      <View style={{ marginTop: 12, gap: 8 }}>
        <Button
          testID={`choose-${plan}-button`}
          onPress={() => onStart(plan)}
          loading={isStartingThis}
          disabled={checkout === "starting"}
          size="lg"
          variant="primary"
          accessibilityLabel={label}
        >
          {label}
        </Button>
        <Text
          testID={`renewal-line-${plan}`}
          className="text-muted-foreground text-xs leading-snug"
          style={WRAPPABLE_TEXT}
        >
          {renewalDisclosure}{" "}
          <Text
            testID={`terms-link-${plan}`}
            accessibilityRole="link"
            accessibilityLabel="Full terms"
            onPress={
              onOpenTerms ??
              (() => {
                void Linking.openURL(`${LEGAL_BASE_URL}/terms#plans`);
              })
            }
            className="text-foreground text-xs font-medium underline"
          >
            Full terms
          </Text>
          .
        </Text>
      </View>
    );
  };

  return (
    <View
      testID={testID}
      className="bg-card rounded-2xl p-4 border border-border"
      style={{ gap: 14 }}
    >
      <View>
        <Text
          accessibilityRole="header"
          className="text-foreground text-base font-semibold"
          style={WRAPPABLE_TEXT}
        >
          Plus
        </Text>
        <Text
          className="text-muted-foreground text-xs mt-0.5"
          style={WRAPPABLE_TEXT}
        >
          One price. Every cap above, removed.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        {/* Monthly card */}
        <View
          testID="monthly-pricing-card"
          className="rounded-xl border border-border p-4 bg-background"
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1 }}>
            <Text
              testID="monthly-price-display"
              className="text-foreground text-2xl font-extrabold"
              style={WRAPPABLE_TEXT}
            >
              {plans.monthly.display}
            </Text>
            <Text className="text-muted-foreground text-sm" style={WRAPPABLE_TEXT}>
              {`per ${plans.monthly.per}`}
            </Text>
          </View>
          <Text
            testID="monthly-billed-text"
            className="text-muted-foreground text-xs mt-1"
            style={WRAPPABLE_TEXT}
          >
            {plans.monthly.billed}
          </Text>
          {renderCta("monthly")}
        </View>

        {/* Annual card */}
        <View
          testID="annual-pricing-card"
          className="rounded-xl border border-primary/40 bg-primary/5 p-4"
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1 }}>
              <Text
                testID="annual-price-display"
                className="text-foreground text-2xl font-extrabold"
                style={WRAPPABLE_TEXT}
              >
                {plans.annual.display}
              </Text>
              <Text className="text-muted-foreground text-sm" style={WRAPPABLE_TEXT}>
                {`per ${plans.annual.per}`}
              </Text>
            </View>
            {plans.annual.savesPercentDisplay ? (
              <View
                testID="annual-saves-badge"
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 12,
                  flexShrink: 1,
                }}
              >
                <Text
                  className="text-primary-foreground text-[10px] font-bold uppercase"
                  style={WRAPPABLE_TEXT}
                >
                  {`Save ${plans.annual.savesPercentDisplay}`}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            testID="annual-billed-text"
            className="text-muted-foreground text-xs mt-1"
            style={WRAPPABLE_TEXT}
          >
            {`${plans.annual.billed}${plans.annual.perMonthDisplay ? ` That is ${plans.annual.perMonthDisplay} a ${plans.monthly.per}.` : ""}`}
          </Text>
          {plans.annual.savingLine ? (
            <Text
              testID="annual-saving-line"
              className="text-primary text-xs font-medium mt-1"
              style={WRAPPABLE_TEXT}
            >
              {plans.annual.savingLine}
            </Text>
          ) : null}
          {renderCta("annual")}
        </View>
      </View>

      {!live && (
        <CheckoutAction
          state={checkout}
          tierName="Plus"
          portalState={portalState}
          browserOpened={browserOpened}
          onStart={() => onStart("monthly")}
          onOpenPortal={onOpenPortal}
          testID="pricing-checkout-action"
        />
      )}

      <Text
        testID="pricing-currency-note"
        className="text-muted-foreground text-[11px] leading-snug"
        style={WRAPPABLE_TEXT}
      >
        {`Prices are in ${currency}. Payment is handled by Stripe, and the total you confirm there is the total you pay.`}
      </Text>
    </View>
  );
}

// ─── Plan comparison ────────────────────────────────────────────────────────

export interface PlanComparisonProps {
  rows: PlanRowCopy[];
  snapshot: EntitlementsSnapshot | null;
  testID?: string;
}

export function PlanComparison({
  rows,
  snapshot,
  testID = "plan-comparison-section",
}: PlanComparisonProps) {
  const { colors } = useThemeTokens();
  const isPlus = snapshot ? snapshot.tier !== "free" : false;

  return (
    <View
      testID={testID}
      className="bg-card rounded-2xl p-4 border border-border"
      style={{ gap: 12 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          paddingBottom: 4,
        }}
      >
        <Text
          accessibilityRole="header"
          className="text-foreground text-base font-semibold"
          style={WRAPPABLE_TEXT}
        >
          What you get
        </Text>
        <View style={{ flexDirection: "row", gap: 16, flexShrink: 1 }}>
          <Text
            className={`text-[11px] font-semibold uppercase tracking-wide ${isPlus ? "text-muted-foreground" : "text-foreground"}`}
            style={[{ width: 56, textAlign: "center" }, WRAPPABLE_TEXT]}
          >
            Free
          </Text>
          <Text
            className="text-[11px] font-semibold uppercase tracking-wide text-primary"
            style={[{ width: 56, textAlign: "center" }, WRAPPABLE_TEXT]}
          >
            Plus
          </Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {rows.map((row, idx) => {
          const usage = usageLine(
            snapshot?.features?.[row.feature as Feature],
            row,
          );
          return (
            <View
              key={row.feature}
              testID={`plan-row-${row.feature}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 8,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: colors.border,
                gap: 8,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  testID={`plan-row-label-${row.feature}`}
                  className="text-foreground text-sm font-medium"
                  style={WRAPPABLE_TEXT}
                >
                  {row.label}
                </Text>
                {usage ? (
                  <Text
                    testID={`plan-row-usage-${row.feature}`}
                    className={`text-[11px] font-medium mt-0.5 ${usage.atLimit ? "text-accent" : "text-muted-foreground"}`}
                    style={WRAPPABLE_TEXT}
                  >
                    {usage.text}
                  </Text>
                ) : null}
              </View>
              <Text
                testID={`plan-row-free-${row.feature}`}
                className="text-muted-foreground text-xs text-center"
                style={[{ width: 56 }, WRAPPABLE_TEXT]}
              >
                {row.free}
              </Text>
              <Text
                testID={`plan-row-plus-${row.feature}`}
                className="text-primary text-xs font-semibold text-center"
                style={[{ width: 56 }, WRAPPABLE_TEXT]}
              >
                {row.plus}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Free forever ───────────────────────────────────────────────────────────

export interface FreeForeverProps {
  items: FreeForeverCopy[];
  note: string;
  testID?: string;
}

export function FreeForever({
  items,
  note,
  testID = "free-forever-section",
}: FreeForeverProps) {
  const { colors } = useThemeTokens();

  return (
    <View
      testID={testID}
      className="bg-card rounded-2xl p-4 border border-border"
      style={{ gap: 12 }}
    >
      <View>
        <Text
          accessibilityRole="header"
          className="text-foreground text-base font-semibold"
          style={WRAPPABLE_TEXT}
        >
          Free, with no cap
        </Text>
        <Text
          testID="free-forever-note"
          className="text-muted-foreground text-xs mt-0.5"
          style={WRAPPABLE_TEXT}
        >
          {note}
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        {items.map((item, idx) => (
          <View
            key={item.label}
            testID={`free-forever-item-${idx}`}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.muted,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 2,
              }}
            >
              <Check size={12} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                className="text-foreground text-sm font-medium"
                style={WRAPPABLE_TEXT}
              >
                {item.label}
              </Text>
              <Text
                className="text-muted-foreground text-xs mt-0.5"
                style={WRAPPABLE_TEXT}
              >
                {item.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Plan screen ────────────────────────────────────────────────────────────

export interface PlanScreenProps {
  deps?: BillingDeps;
  initialPlans?: BillingPlansResponse;
  initialStatus?: BillingStatusResult;
  initialSnapshot?: EntitlementsSnapshot;
}

export default function PlanScreen({
  deps = {},
  initialPlans,
  initialStatus,
  initialSnapshot,
}: PlanScreenProps = {}) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{
    checkout?: string;
    billing?: string;
    session_id?: string;
  }>();

  const paidReturn = params.checkout === "success" || params.billing === "success";
  const paidSessionId = params.session_id;

  const { data: hookSnapshot, loading: entitlementsLoading, refresh } =
    useEntitlements();

  const snapshot = initialSnapshot ?? hookSnapshot;

  const [plansData, setPlansData] = useState<BillingPlansResponse | null>(
    initialPlans ?? null,
  );
  const [plansLoading, setPlansLoading] = useState(!initialPlans);
  const [plansError, setPlansError] = useState<unknown>(null);

  const [billingStatus, setBillingStatus] = useState<BillingStatusResult | null>(
    initialStatus ?? null,
  );
  const [checkout, setCheckout] = useState<CheckoutState>(
    initialStatus
      ? initialStatus.configured &&
        Boolean(initialStatus.plans?.monthly || initialStatus.plans?.annual)
        ? "ready"
        : "unavailable"
      : "checking",
  );
  const [available, setAvailable] = useState<PlanAvailability>({
    monthly: initialStatus?.plans?.monthly ?? false,
    annual: initialStatus?.plans?.annual ?? false,
  });
  const [startingPlan, setStartingPlan] = useState<BillingPlan | null>(null);
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [portalPath, setPortalPath] = useState<string>(PORTAL_PATH);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturnState>(
    paidReturn ? "confirming" : "none",
  );

  const checkoutAvailable = snapshot?.checkoutAvailable;

  // Load plans & billing status
  const loadData = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const [plans, status] = await Promise.all([
        fetchBillingPlans(deps),
        fetchBillingStatus(deps),
      ]);
      setPlansData(plans);
      setBillingStatus(status);
    } catch (err) {
      setPlansError(err);
    } finally {
      setPlansLoading(false);
    }
  }, [deps]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!initialPlans) {
      void loadData();
    }
  }, [loadData, initialPlans]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Update checkout availability
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (checkoutAvailable === undefined && !billingStatus) return;
    setPortalState("idle");

    if (checkoutAvailable === false) {
      setCheckout("unavailable");
      return;
    }

    if (billingStatus) {
      setAvailable(billingStatus.plans);
      setCheckout(
        billingStatus.configured &&
          (billingStatus.plans.monthly || billingStatus.plans.annual)
          ? "ready"
          : "unavailable",
      );
    } else {
      setCheckout("checking");
      void fetchBillingStatus(deps).then((status) => {
        if (!status) {
          setCheckout("unavailable");
          return;
        }
        setBillingStatus(status);
        setAvailable(status.plans);
        setCheckout(
          status.configured && (status.plans.monthly || status.plans.annual)
            ? "ready"
            : "unavailable",
        );
      });
    }
  }, [checkoutAvailable, billingStatus, deps]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Consume return from checkout
  useEffect(() => {
    if (!paidReturn) return;
    let cancelled = false;

    void (async () => {
      try {
        await refresh();
      } catch {
        // non-fatal
      }
      if (!cancelled) {
        setCheckoutReturn("confirmed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paidReturn, paidSessionId, refresh]);

  const onStart = useCallback(
    async (plan: BillingPlan) => {
      if (checkout !== "ready" && checkout !== "error") return;
      setCheckout("starting");
      setStartingPlan(plan);
      try {
        const result = await startCheckout(plan, deps);
        if (result.kind === "state") {
          if (result.portalPath) setPortalPath(result.portalPath);
          setCheckout(result.state);
          return;
        }
        const opened = await openExternally(result.url, deps);
        setCheckout(opened ? "ready" : "error");
        if (opened) setBrowserOpened(true);
      } catch {
        setCheckout("error");
      } finally {
        setStartingPlan(null);
      }
    },
    [checkout, deps],
  );

  const onOpenPortal = useCallback(async () => {
    setPortalState("opening");
    try {
      const opened = await openBillingPortal(portalPath, deps);
      setPortalState(opened ? "idle" : "failed");
    } catch {
      setPortalState("failed");
    }
  }, [portalPath, deps]);

  const hasData = !!plansData;
  const initialLoading = (entitlementsLoading || plansLoading) && !hasData;

  const activeSnapshot: EntitlementsSnapshot = snapshot ?? {
    role: "user",
    tier: "free",
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: false,
    features: {},
  };

  const isPlus = activeSnapshot.tier !== "free";
  const isEnforced = activeSnapshot.enforced !== false;

  return (
    <ScreenState
      loading={initialLoading}
      error={plansError}
      hasData={hasData}
      onRetry={loadData}
      offlineNote="You're offline. Showing last-known plan details."
      testID="plan-screen-state"
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="native-plan-screen"
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        >
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              testID="plan-back-button"
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={[
                minTouchTarget,
                { alignItems: "center", justifyContent: "center" },
              ]}
            >
              <ChevronLeft size={24} color={colors.foreground} />
            </Pressable>
            <Text
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold"
              style={WRAPPABLE_TEXT}
            >
              Plan
            </Text>
          </View>

          {/* Kill-switch check */}
          {!isEnforced ? (
            <UnenforcedPlan
              snapshot={activeSnapshot}
              portalState={portalState}
              onOpenPortal={onOpenPortal}
              onBackToDashboard={() => router.replace("/(tabs)/dashboard")}
            />
          ) : (
            <>
              {checkoutReturn !== "none" && (
                <CheckoutConfirmation
                  state={checkoutReturn}
                  isPlus={isPlus}
                />
              )}

              {/* Current plan card */}
              <CurrentPlan
                snapshot={activeSnapshot}
                portalState={portalState}
                onOpenPortal={onOpenPortal}
              />

              {/* Pricing section (only for non-Plus) */}
              {!isPlus && plansData && (
                <PlanPricing
                  plans={plansData.plans}
                  currency={plansData.currency}
                  checkout={checkout}
                  available={available}
                  portalState={portalState}
                  browserOpened={browserOpened}
                  startingPlan={startingPlan}
                  onStart={onStart}
                  onOpenPortal={onOpenPortal}
                />
              )}

              {/* Free vs Plus comparison table */}
              {plansData && (
                <PlanComparison
                  rows={plansData.rows}
                  snapshot={activeSnapshot}
                />
              )}

              {/* Free forever section */}
              {plansData && (
                <FreeForever
                  items={plansData.freeForever}
                  note={plansData.freeForeverNote}
                />
              )}

              {/* Legal links */}
              <LegalLinks testID="plan-legal-links" />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenState>
  );
}
