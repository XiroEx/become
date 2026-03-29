import { useEffect } from "react";

/** Locks the AppShell content scroll while a modal is open */
export function useLockScroll(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    const el = document.querySelector(".app-shell-content") as HTMLElement | null;
    if (el) el.style.overflow = "hidden";
    return () => {
      if (el) el.style.overflow = "";
    };
  }, [isOpen]);
}
