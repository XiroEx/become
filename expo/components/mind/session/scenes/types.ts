import type { SceneProps } from "@become/core";

/**
 * THE SCENE CONTRACT, AND IT IS THE WEB'S (NP-098).
 *
 * `SceneProps` lives in `webapp/lib/mind/moves.ts` and travels to native inside
 * `@become/core` (NP-062), so there is exactly one definition of what a Mind
 * scene is handed and what it may report back:
 *
 *   move      the beat to play (title, subtitle, and the kind-specific payload)
 *   protocol  breath only — the player has already resolved `'auto'` from the
 *             live check-in, so a scene never reads the state itself
 *   onDone    advance; pass a `{ q, a }` when the beat elicited a real answer
 *   onState   state-check only — report the chosen state AND the word tapped
 *   preview   admin lab / dry run: the scene skips its own network writes
 *
 * A scene is DUMB: sequencing, the locked-in swap, the realignment and the
 * completion all belong to `SessionPlayer`. The only thing added here is a
 * `testID`, because a React Native test queries by it rather than by text.
 */
export type MindSceneProps = SceneProps & {
  testID?: string;
};
