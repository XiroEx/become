import { useCallback, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { MANAGE_BILLING_LABEL } from "@become/core";
import { hasManageableBilling, useEntitlements } from "@/lib/entitlements";
import { openBillingPortal, type PortalState } from "@/lib/entitlements/billing";
import { ManageBillingButton } from "@/components/billing/ManageBillingButton";

/**
 * The Billing card in Settings — the native mirror of
 * `webapp/components/billing/BillingSection.tsx`. NP-303: native Settings had
 * no billing exit at all (only the Plan page carried one); the web renders
 * this card, above Legal & support, for any member with a manageable Stripe
 * subscription.
 *
 * IT RENDERS NOTHING FOR ANYBODY WITHOUT A SUBSCRIPTION — see
 * `hasManageableBilling()`. Not gated on the entitlements kill-switch on
 * purpose: billing is real money, regardless of whether tier limits are
 * enforced (see `BillingSection.tsx`'s own header comment on web for why).
 */
export function BillingSection() {
  const { data } = useEntitlements();
  const [portalState, setPortalState] = useState<PortalState>("idle");

  const onOpenPortal = useCallback(async () => {
    setPortalState("opening");
    const opened = await openBillingPortal();
    setPortalState(opened ? "idle" : "failed");
  }, []);

  if (!hasManageableBilling(data?.subscription)) return null;

  return (
    <View
      testID="settings-billing-section"
      className="rounded-xl border border-border bg-card p-4"
      style={{ gap: 12 }}
    >
      <Text
        accessibilityRole="header"
        className="text-foreground text-base font-semibold"
      >
        Billing
      </Text>
      <Text className="text-muted-foreground text-xs">
        {MANAGE_BILLING_LABEL} is also on your Plan page.
      </Text>
      <ManageBillingButton
        state={portalState}
        onOpenPortal={() => {
          void onOpenPortal();
        }}
        showNote
      />
    </View>
  );
}

export default BillingSection;
