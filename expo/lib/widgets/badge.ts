/**
 * App-icon badge clearer for native/hybrid client.
 * Clears the icon badge on sign-out so a member's unfinished day count
 * does not outlive their session on this device.
 */
export async function clearAppBadge(): Promise<void> {
  try {
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as {
            clearAppBadge?: () => Promise<void>;
            setAppBadge?: (count?: number) => Promise<void>;
          })
        : null;
    if (typeof nav?.clearAppBadge === "function") {
      await nav.clearAppBadge();
    } else if (typeof nav?.setAppBadge === "function") {
      await nav.setAppBadge(0);
    }
  } catch {
    // Feature detection / unsupported environment — safe no-op.
  }
}
