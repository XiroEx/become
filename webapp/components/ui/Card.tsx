"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Canonical card class strings. These are the ONLY shells we draw across the
 * app. See UI_CONSISTENCY_PLAN.md §3.1–§3.3.
 */
const VARIANT_CLASSES = {
  default:
    "rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900",
  compact:
    "rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900",
  // Hero cards intentionally omit `bg-*` and `border-{color}` defaults — heroes
  // bring their own backdrop (chapter color, dark zinc, gradient overlay) per
  // UI_CONSISTENCY_PLAN.md §7.
  hero: "rounded-2xl border p-4 sm:p-5",
} as const;

/**
 * Status accents — render as a 3px left stripe via an absolutely-positioned
 * span. We use a span (not `border-l-[3px]` and not `before:`) so content does
 * not shift, and so it composes with arbitrary `as` elements that might not
 * play nicely with pseudo-elements.
 */
const ACCENT_STRIPE_CLASSES = {
  none: null,
  success: "bg-green-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
} as const;

export type CardVariant = keyof typeof VARIANT_CLASSES;
export type CardAccent = keyof typeof ACCENT_STRIPE_CLASSES;

/* -------------------------------------------------------------------------- */
/* Polymorphic typing                                                         */
/* -------------------------------------------------------------------------- */

type AsProp<E extends React.ElementType> = { as?: E };

type PolymorphicProps<E extends React.ElementType, P> = P &
  AsProp<E> &
  Omit<React.ComponentPropsWithoutRef<E>, keyof (P & AsProp<E>)>;

type PolymorphicPropsWithRef<E extends React.ElementType, P> = PolymorphicProps<
  E,
  P
> & { ref?: React.ComponentPropsWithRef<E>["ref"] };

type CardOwnProps = {
  /** Visual variant. Defaults to `default`. */
  variant?: CardVariant;
  /** Status accent. Renders a 3px left stripe; never thickens the border. */
  accent?: CardAccent;
  /** Extra class names; user-provided classes win over defaults. */
  className?: string;
  children?: React.ReactNode;
};

export type CardProps<E extends React.ElementType = "div"> =
  PolymorphicPropsWithRef<E, CardOwnProps>;

type CardComponent = <E extends React.ElementType = "div">(
  props: CardProps<E>,
) => React.ReactElement | null;

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Polymorphic + ref-forwarding typing in TS is notoriously verbose. The
 * standard escape hatch is to type the generic shape externally (via
 * `CardComponent`) and let the implementation use a single permissive ref
 * type internally. We never widen to `any` — `unknown` is the bound — and
 * external callers see fully-typed polymorphic props.
 */
type CardImplProps = CardOwnProps &
  Omit<React.HTMLAttributes<HTMLElement>, keyof CardOwnProps> & {
    as?: React.ElementType;
  };

const CardImpl = React.forwardRef<HTMLElement, CardImplProps>(
  function CardRender(
    {
      as,
      variant = "default",
      accent = "none",
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const Component = (as ?? "div") as React.ElementType;
    const stripe = ACCENT_STRIPE_CLASSES[accent];
    const hasAccent = stripe !== null;

    return (
      <Component
        ref={ref}
        className={cn(
          VARIANT_CLASSES[variant],
          // Card clips its rounded corners — accent stripe spans full height
          // and gets cut by the card's radius rather than overflowing.
          hasAccent && "relative overflow-hidden",
          className,
        )}
        {...rest}
      >
        {hasAccent ? (
          <span
            aria-hidden="true"
            className={cn("absolute inset-y-0 left-0 w-[8px]", stripe)}
          />
        ) : null}
        {children}
      </Component>
    );
  },
);

CardImpl.displayName = "Card";

export const Card = CardImpl as unknown as CardComponent & {
  displayName?: string;
};

export default Card;
