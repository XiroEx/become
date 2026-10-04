import { Share } from "react-native";
import {
  apiFetch,
  ShareCreateResponseSchema,
  type ShareCreateRequest,
  type ShareCreateResponse,
  type ShareSessionExercise,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * PUBLIC WORKOUT SHARES (NP-165).
 *
 * Native port of `webapp/components/share/ShareButton.tsx`: `POST /api/share
 * { kind: 'program' | 'workout' | 'session', programId, day, phase, session }`
 * creates a public, read-only snapshot and answers `{ shareId, url }`, where
 * `url` is a RELATIVE path (`/share/<shareId>`). The public page stays on the
 * web (`webapp/app/share/[shareId]`, signed out) — native only creates the
 * link and hands the ABSOLUTE URL on the web's domain to React Native's
 * `Share.share`, so Messages, Mail and copy are offered by the system sheet
 * on iOS and Android. JSON export (`GET /api/share/[shareId]`) stays
 * web-only.
 *
 * The server enforces the visibility rule (NP-029): a member can share only
 * what they can open — catalogue programs, their own custom programs, and
 * ones shared with them. A 404 from the route (another member's private
 * custom program) surfaces here as a thrown error the caller renders.
 */

export type ShareKind = ShareCreateRequest["kind"];

export interface CreateShareInput {
  kind: ShareKind;
  programId?: string;
  day?: string;
  phase?: string;
  session?: {
    title: string;
    focus?: string;
    exercises: ShareSessionExercise[];
  };
  token?: string | null;
}

/**
 * The absolute URL a recipient opens in a browser. The canonical domain is
 * the same one every other native web link uses (`WEBAPP_BASE_URL` in
 * `@/lib/config`): the recipient lands on the public web page signed out,
 * where they are prompted to log in to start the program.
 */
export function workoutShareViewerUrl(
  share: Pick<ShareCreateResponse, "url">,
  baseUrl: string = WEBAPP_BASE_URL,
): string {
  return `${baseUrl.replace(/\/$/, "")}${share.url}`;
}

/**
 * Create the public snapshot (`POST /api/share`) and open React Native's
 * `Share.share` with the absolute web URL. Never throws for a dismissed
 * sheet: a share failure (network, validation, or the server's 404 for a
 * program the member cannot open) rejects so the caller can render it; a
 * dismissed sheet resolves with the share.
 */
export async function shareWorkoutLink(
  args: CreateShareInput,
  deps: {
    postShare?: (body: ShareCreateRequest) => Promise<ShareCreateResponse>;
    openShareSheet?: (options: {
      message: string;
      title?: string;
    }) => Promise<unknown>;
    baseUrl?: string;
  } = {},
): Promise<ShareCreateResponse> {
  const postShare =
    deps.postShare ??
    ((body: ShareCreateRequest) =>
      apiFetch("/api/share", ShareCreateResponseSchema, {
        baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
        getToken: () => args.token ?? undefined,
        method: "POST",
        body: body as unknown as Record<string, unknown>,
      }));
  const openShareSheet =
    deps.openShareSheet ?? ((options) => Share.share(options));

  const body: ShareCreateRequest = { kind: args.kind };
  if (args.programId !== undefined) body.programId = args.programId;
  if (args.day !== undefined) body.day = args.day;
  if (args.phase !== undefined) body.phase = args.phase;
  if (args.session !== undefined) {
    body.session = {
      title: args.session.title,
      ...(args.session.focus !== undefined
        ? { focus: args.session.focus }
        : {}),
      exercises: args.session.exercises.map((e) => ({ ...e })),
    };
  }

  const share = await postShare(body);
  if (!share || typeof share.url !== "string" || share.url.length === 0) {
    throw new Error("Could not create a share link.");
  }
  const message = workoutShareViewerUrl(share, deps.baseUrl ?? WEBAPP_BASE_URL);
  try {
    await openShareSheet({ message, title: "A Become workout for you" });
  } catch {
    /* dismissed — the link was still created */
  }
  return share;
}
