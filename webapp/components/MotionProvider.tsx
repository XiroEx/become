"use client";

// Root-level Framer Motion defaults. Two effects, both purely additive:
//  - `reducedMotion="user"` makes every motion.* component in the app honor
//    prefers-reduced-motion automatically, without each of the ~100+ files
//    that already animate needing its own check.
//  - `transition` sets the fallback easing (matches The Becoming journey's
//    curve — see lib/motion.ts) for any motion component that doesn't specify
//    its own transition. Components with an explicit `transition` prop are
//    unaffected.

import { MotionConfig } from "framer-motion";
import { ReactNode } from "react";
import { EASE_OUT } from "@/lib/motion";

export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: EASE_OUT }}>
      {children}
    </MotionConfig>
  );
}
