/**
 * ─── THE ONE UPSELL SURFACE, ON THE PHONE (NP-052) ────────────────────────────
 *
 * Native port of `webapp/components/UpgradeSheet.tsx`. Every gate — a server 403
 * routed by `lib/errors/useApiErrorHandler`, or a client teaser from
 * `AllowanceLock` / `TierGate` — opens THIS and nothing else, through
 * `showUpgradeSheet(gate)`.
 *
 * Everything it says comes from the gate it is handed: the server owns the
 * refusal wording (`gate.error`, rendered VERBATIM) and the tier being asked for
 * (`gate.requiresTier`), so a member can never be shown a number or a plan name
 * that disagrees with the rule that actually refused them. No amount, discount,
 * trial length or date is ever written here — and on native that is not only a
 * copy rule: an amount typed into the app can only be changed by an App Store
 * release, while the server's can change with a deploy.
 *
 * Billing may not be configured at all — that is the state Become ships in. The
 * CTA is therefore rendered ONLY once checkout is known to work: the snapshot's
 * `checkoutAvailable` answers it for free, and only an unknown answer costs a
 * probe of `GET /api/billing/status`. Anything else is a coming-soon note in the
 * CTA's place. It never renders a button that cannot work.
 *
 * WHAT IS DIFFERENT FROM THE WEB, AND WHY:
 *
 *   • the CTA leaves the app. Plus may be sold from the iOS app only through an
 *     external link on the US storefront (decision 9/20, App Review 3.1.1(a)),
 *     so the button hands Stripe's URL to `Linking.openURL` — Safari on iOS,
 *     Chrome on Android — and NEVER to `expo-web-browser`. An in-app browser is
 *     still inside the app. `lib/entitlements/billing.ts` holds that rule and
 *     `__tests__/upgradeSheet.test.tsx` fails the build if it is broken.
 *   • the CTA SAYS SO. A button that silently throws the member into another app
 *     mid-purchase is the kind of surprise that gets a one-star review, so the
 *     wording names the website and the note under it says what comes back.
 *   • `returnTo: 'app'` (NP-051), so Stripe returns them to a public page that
 *     can reopen Become rather than to a signed-out `/dashboard/plan`.
 *   • \"See everything in Plus\" links to `/plan` (NP-053), closing the sheet so it
 *     is not left sitting over the page it navigated to.
 */

import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  Check,
  CreditCard,
  ExternalLink,
  Lock,
  RefreshCw,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import {
  PLUS_BENEFITS,
  allowanceLine,
  featureHeadline,
  tierLabel,
  useEntitlements,
  type SheetGate,
} from "@/lib/entitlements";
import {
  PORTAL_PATH,
  dismissLabel,
  openBillingPortal,
  openExternally,
  probeCheckoutAvailable,
  startCheckout,
  type BillingDeps,
  type CheckoutState,
  type PortalState,
} from "@/lib/entitlements/billing";
import { markBillingReturnOpened } from "@/lib/entitlements/billingReturn";

/**
 * ─── THE WORDS, IN ONE PLACE ──────────────────────────────────────────────────
 *
 * Jon approves the wording of a paywall, so it lives in named constants rather
 * than inline in six branches: a copy change is then one edit, and
 * `__tests__/upgradeSheet.test.tsx` asserts the member is told the purchase
 * happens on the website before they are sent there.
 *
 * "the website" and not "Safari": the same build ships to Android, where this
 * opens Chrome, and naming the wrong browser is worse than naming none.
 */
export const CHECKOUT_CTA_SUFFIX = "on the website";

/** Under the CTA, before the tap. */
export const CHECKOUT_WEB_NOTE =
  "Your purchase continues on the Become website. This opens your browser — come back to the app when you're done.";

/** Under the CTA, after the browser has been handed the checkout page. */
export const CHECKOUT_OPENED_NOTE =
  "Checkout is open in your browser. Come back to the app when you're done.";

/** Under "Update payment method", which leaves the app for the same reason. */
export const PORTAL_WEB_NOTE =
  "Billing opens in your browser on the Become website.";

export interface UpgradeSheetProps {
  open: boolean;
  onClose: () => void;
  /** The verbatim 403 body, a `syntheticGate` for a teaser, or a `planGate`. */
  gate: SheetGate | null;
  /**
   * Network, session and browser injection — tests only. MUST be referentially
   * stable (a module constant or a `useMemo`): the availability probe depends on
   * it, and a fresh object every render would re-probe on every render.
   */
  deps?: BillingDeps;
}

/** Stable default, so omitting `deps` cannot restart the probe. */
const NO_DEPS: BillingDeps = {};

export interface CheckoutActionProps {
  state: CheckoutState;
  /** The tier as a member reads it, from the gate. Never a literal "Plus". */
  tierName: string;
  portalState: PortalState;
  /** Has the browser already been handed the checkout page? */
  browserOpened: boolean;
  onStart: () => void;
  onOpenPortal: () => void;
  testID?: string;
}

/**
 * The one slot under the benefit rows: a live CTA, a note, or nothing to press.
 *
 * Exported so each branch can be rendered on its own in a test. A state that is
 * only reachable through an effect and a fetch is otherwise reachable only by
 * driving the whole sheet, which is how the web's "every refusal means not for
 * sale" collapse shipped in the first place.
 */
export function CheckoutAction({
  state,
  tierName,
  portalState,
  browserOpened,
  onStart,
  onOpenPortal,
  testID = "upgrade-sheet",
}: CheckoutActionProps) {
  const { colors } = useThemeTokens();

  // The purchase CTA exists ONLY when checkout is known to work. A confident
  // "Upgrade to Plus" that answers 503 is worse than no button at all.
  if (state === "ready" || state === "starting") {
    return (
      <View style={{ marginTop: 20, gap: 8 }}>
        <Button
          testID={`${testID}-cta`}
          onPress={onStart}
          loading={state === "starting"}
          size="lg"
          accessibilityLabel={`Upgrade to ${tierName} ${CHECKOUT_CTA_SUFFIX}`}
          accessibilityHint="Opens your browser to finish the purchase on the Become website"
        >
          {`Upgrade to ${tierName} ${CHECKOUT_CTA_SUFFIX}`}
        </Button>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <ExternalLink size={14} color={colors["muted-foreground"]} />
          <Text
            testID={browserOpened ? `${testID}-cta-opened` : `${testID}-cta-note`}
            style={WRAPPABLE_TEXT}
            className="text-muted-foreground text-xs"
          >
            {browserOpened ? CHECKOUT_OPENED_NOTE : CHECKOUT_WEB_NOTE}
          </Text>
        </View>
      </View>
    );
  }

  if (state === "checking") {
    return (
      <View
        testID={`${testID}-checking`}
        accessibilityLiveRegion="polite"
        className="border-border mt-5 rounded-2xl border px-4 py-3.5"
      >
        <Text className="text-muted-foreground text-center text-sm">
          Checking availability…
        </Text>
      </View>
    );
  }

  // A subscription already exists on this account and could not be charged.
  // Selling a second one is exactly what the route refused: both would bill, and
  // when dunning finally gives up on the first, its terminal event downgrades a
  // member the second one is still charging. The way out is a working card.
  if (state === "fix-payment") {
    return (
      <View style={{ marginTop: 20, gap: 12 }} accessibilityLiveRegion="polite">
        <View
          testID={`${testID}-fix-payment`}
          className="border-destructive/40 rounded-xl border px-3 py-3"
        >
          <Text className="text-destructive text-sm font-semibold" style={WRAPPABLE_TEXT}>
            Your payment method needs updating.
          </Text>
          <Text className="text-destructive mt-1 text-sm" style={WRAPPABLE_TEXT}>
            There&apos;s already a subscription on this account that couldn&apos;t be
            charged. Update the card in billing rather than starting a second one.
          </Text>
        </View>
        <Button
          testID={`${testID}-portal`}
          onPress={onOpenPortal}
          loading={portalState === "opening"}
          size="lg"
          variant="secondary"
          accessibilityLabel="Update payment method"
          accessibilityHint="Opens your browser to Become's billing page"
        >
          Update payment method
        </Button>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <CreditCard size={14} color={colors["muted-foreground"]} />
          <Text
            testID={`${testID}-portal-note`}
            style={WRAPPABLE_TEXT}
            className="text-muted-foreground text-xs"
          >
            {PORTAL_WEB_NOTE}
          </Text>
        </View>
        {portalState === "failed" ? (
          <Text
            testID={`${testID}-portal-failed`}
            style={WRAPPABLE_TEXT}
            className="text-muted-foreground text-xs font-medium"
          >
            Billing didn&apos;t open just now. Try that again in a moment.
          </Text>
        ) : null}
      </View>
    );
  }

  // Nothing to sell. `already_subscribed` (paying already), `already_plus`
  // (grandfathered, or an admin) — either way the account HAS what this sheet is
  // selling, and the only honest thing to say is so.
  if (state === "already-plus") {
    return (
      <View
        testID={`${testID}-already-plus`}
        accessibilityLiveRegion="polite"
        className="border-border mt-5 flex-row items-start gap-3 rounded-xl border px-3 py-3"
      >
        <Check size={16} color={colors.success} />
        <Text className="text-foreground text-sm" style={WRAPPABLE_TEXT}>
          You already have {tierName} on this account — there&apos;s nothing to buy
          here. If something still looks locked, close this and reopen the app.
        </Text>
      </View>
    );
  }

  // Something broke on the way to Stripe. This is the branch that must never
  // read as "not for sale": a member who taps once during a blip would carry
  // that impression away, because nothing in this sheet re-probes afterwards.
  if (state === "error") {
    return (
      <View style={{ marginTop: 20, gap: 12 }} accessibilityLiveRegion="polite">
        <View
          testID={`${testID}-checkout-error`}
          className="border-border flex-row items-start gap-3 rounded-xl border px-3 py-3"
        >
          <AlertTriangle size={16} color={colors["muted-foreground"]} />
          <Text className="text-foreground text-sm" style={WRAPPABLE_TEXT}>
            Checkout didn&apos;t start. That one is on us, and nothing was charged.
          </Text>
        </View>
        <Button
          testID={`${testID}-retry`}
          onPress={onStart}
          size="lg"
          accessibilityLabel="Try again"
        >
          Try again
        </Button>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <RefreshCw size={14} color={colors["muted-foreground"]} />
          <Text
            testID={`${testID}-cta-note`}
            style={WRAPPABLE_TEXT}
            className="text-muted-foreground text-xs"
          >
            {CHECKOUT_WEB_NOTE}
          </Text>
        </View>
      </View>
    );
  }

  // 'unavailable'. No email is captured anywhere, so nothing here may promise
  // one. What IS true is the part a capped member is worried about: their work is
  // not going anywhere.
  return (
    <View
      testID={`${testID}-unavailable`}
      accessibilityLiveRegion="polite"
      className="border-accent/40 mt-5 rounded-xl border px-3 py-3"
    >
      <Text className="text-accent text-sm" style={WRAPPABLE_TEXT}>
        Upgrades aren&apos;t open yet. Everything you&apos;ve made stays yours.
      </Text>
    </View>
  );
}

export function UpgradeSheet({
  open,
  onClose,
  gate,
  deps = NO_DEPS,
}: UpgradeSheetProps) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { data } = useEntitlements();
  const [checkout, setCheckout] = useState<CheckoutState>("checking");
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [portalPath, setPortalPath] = useState<string>(PORTAL_PATH);
  const [browserOpened, setBrowserOpened] = useState(false);

  // Probe billing only while the sheet is actually open — a closed sheet must not
  // cost a request, and the answer can change between openings.
  //
  // eslint-disable react-hooks/set-state-in-effect: the probe IS a read of an
  // external system (the server's billing configuration), so its answer cannot
  // be derived during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // A failed portal attempt, and a browser handover, belong to the opening
    // that produced them.
    setPortalState("idle");
    setBrowserOpened(false);

    if (data?.checkoutAvailable === true) {
      setCheckout("ready");
      return;
    }
    // The snapshot already said no. Probing would only confirm it, and every
    // millisecond of `checking` in between is a millisecond in which the sheet
    // could show something it will have to take away.
    if (data?.checkoutAvailable === false) {
      setCheckout("unavailable");
      return;
    }
    setCheckout("checking");
    void probeCheckoutAvailable(deps).then((next) => {
      if (!cancelled) setCheckout(next);
    });

    return () => {
      cancelled = true;
    };
  }, [open, data?.checkoutAvailable, deps]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onStart = useCallback(() => {
    if (!gate) return;
    // Belt and braces: the CTA is not rendered outside 'ready', so this is only
    // reachable by a race with the probe — or by the retry in the 'error'
    // branch, which is the same attempt a second time.
    if (checkout !== "ready" && checkout !== "error") return;
    setCheckout("starting");
    void (async () => {
      const result = await startCheckout(deps);
      if (result.kind === "state") {
        if (result.portalPath) setPortalPath(result.portalPath);
        setCheckout(result.state);
        return;
      }
      // THE PURCHASE LEAVES THE APP HERE, and only here.
      const opened = await openExternally(result.url, deps);
      // Back to 'ready' either way: the member is in Safari now, and when they
      // return this sheet is still mounted — a spinner that never resolves is
      // the one thing it must not be left showing.
      setCheckout(opened ? "ready" : "error");
      // Remember the handover (NP-054): coming back may mean switching apps
      // manually — no link, no params — in which case the plan page's
      // foreground re-read is the only refresh.
      if (opened) {
        setBrowserOpened(true);
        markBillingReturnOpened("checkout");
      }
    })();
  }, [gate, checkout, deps]);

  const onOpenPortal = useCallback(() => {
    setPortalState("opening");
    void openBillingPortal(portalPath, deps).then((opened) => {
      setPortalState(opened ? "idle" : "failed");
      // Same memory as checkout (NP-054): a portal visit can cancel the
      // subscription, and the foreground re-read shows `cancelAtPeriodEnd`.
      if (opened) markBillingReturnOpened("portal");
    });
  }, [portalPath, deps]);

  // Nothing to say without a gate, and nothing to say at all while the
  // kill-switch is off — that is the launch-day zero-change contract. A null
  // snapshot is NOT treated as unenforced: a real 403 got us here.
  if (!gate) return null;
  if (data && data.enforced === false) return null;

  const line = allowanceLine(gate);
  const tierName = tierLabel(gate.requiresTier);

  return (
    <BottomSheet
      visible={open}
      onClose={onClose}
      testID="upgrade-sheet"
      accessibilityLabel={`Upgrade to ${tierName}`}
      sheetStyle={{ maxHeight: "90%" }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <View className="flex-row items-center gap-2">
          <View className="bg-muted h-8 w-8 items-center justify-center rounded-xl">
            <Lock size={16} color={colors.primary} />
          </View>
          <Text
            testID="upgrade-sheet-tier"
            accessibilityRole="header"
            className="text-foreground text-lg font-bold"
            style={WRAPPABLE_TEXT}
          >
            {tierName}
          </Text>
        </View>

        <Text
          testID="upgrade-sheet-headline"
          className="text-foreground mt-3 text-xl font-extrabold"
          style={WRAPPABLE_TEXT}
        >
          {featureHeadline(gate.feature, gate.requiresTier)}
        </Text>

        {/* The server's own words, verbatim. Nothing is added to them. */}
        <Text
          testID="upgrade-sheet-error"
          className="text-muted-foreground mt-2 text-sm"
          style={WRAPPABLE_TEXT}
        >
          {gate.error}
        </Text>

        {line ? (
          <Text
            testID="upgrade-sheet-allowance"
            className="text-muted-foreground mt-2 text-xs font-medium"
            style={WRAPPABLE_TEXT}
          >
            {line}
          </Text>
        ) : null}

        <View style={{ marginTop: 20, gap: 8 }}>
          {PLUS_BENEFITS.map((benefit, index) => (
            <View
              key={benefit}
              testID={`upgrade-sheet-benefit-${index}`}
              className="border-border flex-row items-start gap-3 rounded-xl border p-3"
            >
              <Check size={14} color={colors.primary} />
              <Text
                className="text-foreground text-sm font-medium"
                style={WRAPPABLE_TEXT}
              >
                {benefit}
              </Text>
            </View>
          ))}
        </View>

        <CheckoutAction
          state={checkout}
          tierName={tierName}
          portalState={portalState}
          browserOpened={browserOpened}
          onStart={onStart}
          onOpenPortal={onOpenPortal}
        />

        <View style={{ marginTop: 12 }}>
          <Button
            testID="upgrade-sheet-see-all"
            onPress={() => {
              onClose();
              router.push("/plan");
            }}
            variant="ghost"
            size="lg"
            accessibilityLabel={`See everything in ${tierName}`}
          >
            {`See everything in ${tierName}`}
          </Button>
        </View>

        <View style={{ marginTop: 12 }}>
          <Button
            testID="upgrade-sheet-dismiss"
            onPress={onClose}
            variant="ghost"
            size="lg"
          >
            {dismissLabel(checkout)}
          </Button>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export default UpgradeSheet;
