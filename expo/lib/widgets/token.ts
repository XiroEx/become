/**
 * THE TOKEN HAND-OFF — the same one on both platforms, and the whole reason a
 * widget can draw at all.
 *
 * A widget surface is not this app. On iOS it is a WidgetKit extension; on
 * Android it is an `AppWidgetProvider` whose refresh runs as a headless JS task
 * with no screen, no navigation and no session in memory. Whatever it holds
 * sits on the device for months and is read by code the member never opened, so
 * it does NOT get the 30-day session JWT — the credential that can log a
 * workout, move a goal, start a checkout or delete the account.
 *
 * `POST /api/widgets/token` (full session required, writes nothing, hit at each
 * app open) mints a token with `scope: 'widgets'`, which `verifyAuth` refuses
 * everywhere except `GET /api/widgets/summary` — `/api/auth/me` included, which
 * matters because that route's sliding refresh would otherwise turn it back
 * into a session. See AGENTS.md § The widgets token and
 * `webapp/lib/widgets/token.ts`.
 *
 * TWO RULES THIS FILE KEEPS, because they are the contract the server was built
 * against ("ask for a fresh token at each open, store nothing longer, and read
 * only the summary"):
 *
 *  1. **Raw `fetch`, never `apiFetch`.** `apiFetch` reports a 401 to the app's
 *     unauthorized handler, which signs the member out. A background
 *     hand-off is not allowed to end a session on the strength of one refusal,
 *     and there is no body worth parsing beyond the token itself.
 *  2. **A refusal is not a network failure.** A 401/403 means the server said
 *     no (dead session, or a deletion pending — minting is refused while one
 *     is, or the next open would hand the token straight back), so the stored
 *     token is dead too and the caller clears it. Offline says nothing about
 *     the token, so the caller keeps it and the widgets keep painting.
 */
import { WidgetTokenResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  widgetsTokenSecureStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";

export type MintWidgetsTokenResult =
  /** A widgets-scoped token, ready to store. */
  | { kind: "ok"; token: string; refreshAfterSeconds: number | null }
  /** The server said no (401, 403 deletion pending, or a body that is not a
   *  widgets token). Whatever is stored is no good either. */
  | { kind: "refused"; status: number }
  /** Offline, DNS, a 5xx. Says nothing about the token already stored. */
  | { kind: "unreachable" };

export interface MintWidgetsTokenDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Trade the member's session for a read-only widgets token.
 *
 * Never throws: every caller is a background job at app open or an OS refresh,
 * and neither may fail a launch because a widget could not be fed.
 */
export async function mintWidgetsToken(
  sessionToken: string,
  deps: MintWidgetsTokenDeps = {},
): Promise<MintWidgetsTokenResult> {
  const baseUrl = deps.baseUrl ?? WEBAPP_BASE_URL;
  const send = deps.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await send(`${baseUrl}/api/widgets/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  } catch {
    return { kind: "unreachable" };
  }

  // 401 (the session is gone) and 403 (`deletion_pending`) are the server's
  // answers. Everything else — 5xx, a gateway page — is the network being the
  // network, and is retried at the next open.
  if (response.status === 401 || response.status === 403) {
    return { kind: "refused", status: response.status };
  }
  if (!response.ok) return { kind: "unreachable" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "unreachable" };
  }

  const parsed = WidgetTokenResponseSchema.safeParse(body);
  // A 200 whose body is not a widgets token is a REFUSAL, not a retry: the
  // scope is a literal in the schema, so this is also what stops a token with
  // any other scope from being stored where a widget will read it.
  if (!parsed.success) return { kind: "refused", status: response.status };

  return {
    kind: "ok",
    token: parsed.data.token,
    refreshAfterSeconds: parsed.data.refreshAfterSeconds ?? null,
  };
}

/**
 * Persist the token where the widget's own refresh can read it.
 *
 * Android's App Widget task runs inside this app's process, so "shared storage"
 * is this app's SecureStore (Keystore) under its own key — the Android
 * equivalent of iOS's App Group, and the reason the two platforms can share
 * every other file in this directory.
 */
export async function storeWidgetsToken(
  token: string,
  store: TokenStore = widgetsTokenSecureStore,
): Promise<void> {
  await store.set(token);
}

/** The stored widgets token, or null. A store that throws reads as "none". */
export async function loadWidgetsToken(
  store: TokenStore = widgetsTokenSecureStore,
): Promise<string | null> {
  try {
    return await store.get();
  } catch {
    return null;
  }
}

/**
 * Forget the widgets token.
 *
 * This is the LOCAL half of a revocation. The server half is already built and
 * is the one that matters for a token that has left the device: signing out
 * (`POST /api/auth/logout`) or requesting deletion bumps
 * `User.widgetTokenVersion`, and every token minted before the bump stops being
 * accepted by the summary route. Clearing here is what makes the change visible
 * on the home screen NOW instead of at the widget's next refresh.
 */
export async function clearWidgetsToken(
  store: TokenStore = widgetsTokenSecureStore,
): Promise<void> {
  try {
    await store.clear();
  } catch {
    // A Keystore that refuses to delete cannot keep a widget signed in: the
    // token it holds has already been revoked server-side by the sign-out that
    // brought us here, so the next refresh is answered 401 and clears it again.
  }
}
