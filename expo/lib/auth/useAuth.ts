/**
 * The session, read from the ONE provider at the root.
 *
 * This used to be a stateful hook: every screen that called it kept its own
 * token, its own user and its own `GET /api/auth/me`. It is now a read of
 * `AuthProvider`'s context, so there is exactly one session in the app and
 * exactly one place that ends it. The module path is unchanged on purpose —
 * every screen already imports from here.
 */
import {
  useAuthContext,
  type AuthContextValue,
} from "@/lib/auth/AuthProvider";

/**
 * The shape screens destructure. Unchanged fields kept their names.
 * `AuthStatus` and `SignOutReason` live in AuthProvider — re-exporting them
 * here too would give `lib/auth/index.ts` two paths to the same name.
 */
export type UseAuthResult = AuthContextValue;

export function useAuth(): UseAuthResult {
  return useAuthContext();
}
