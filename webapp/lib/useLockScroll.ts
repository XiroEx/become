import { useEffect } from "react";

/** Locks the main scroll container while a modal is open, then restores it */
export function useLockScroll(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;

    const main = document.querySelector("main") as HTMLElement | null;
    const savedScrollTop = main?.scrollTop ?? 0;

    if (main) main.style.overflow = "hidden";

    return () => {
      if (main) {
        main.style.overflow = "";
        // iOS may scroll <main> when the keyboard appears inside a fixed modal; reset it
        main.scrollTop = savedScrollTop;
      }
      // iOS WebKit can mutate scrollTop on html/body even when overflow:hidden
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
  }, [isOpen]);
}
