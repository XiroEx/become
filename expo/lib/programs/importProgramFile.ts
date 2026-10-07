/**
 * ─── "UPLOAD A FILE", ON A PHONE (NP-281) ───────────────────────────────────
 *
 * The web's import flow offers two ways in — Paste text and Upload a file
 * (`.txt` or `.md`, `MAX_TEXT_FILE_BYTES = 200_000`, see
 * `webapp/app/dashboard/programs/new/ImportProgramFlow.tsx`) — and native had
 * only the first, with a note saying so (`PasteImportSheet`'s
 * `-paste-only-note`). This closes that half.
 *
 * NO NEW NATIVE MODULE IS PULLED IN FOR IT: `expo-file-system` (SDK 57) ships
 * the system file picker itself (`File.pickFileAsync`) and was already in the
 * tree as a transitive dependency of `expo`; this card only promotes it to a
 * direct dependency, which is what importing it from app code means.
 *
 * Everything here is the FILE half only. The text it returns goes through the
 * very same `importProgramFromText` (NP-242) the paste path uses, so the AI
 * run, the consent prompt, the entitlement gate and the review step are one
 * code path with two doors.
 */

import { File, type PickSingleFileResult } from "expo-file-system";

/** The web's own cap (`MAX_TEXT_FILE_BYTES`), to the byte. */
export const MAX_IMPORT_FILE_BYTES = 200_000;

/**
 * What the picker is allowed to offer. `text/markdown` is not a type every
 * Android provider reports for a `.md` file, so `text/*` rides along — the
 * extension check below is what actually refuses a `.pdf` the provider
 * mislabelled.
 */
export const IMPORT_FILE_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/*",
];

/** The two extensions the web's `accept` allows. */
export const IMPORT_FILE_EXTENSIONS = [".txt", ".md"];

export type PickedImportFile =
  | { status: "ok"; text: string; name: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/** The web's copy, verbatim (ImportProgramFlow.tsx's three file messages). */
const TOO_LARGE_MESSAGE =
  "That file is too large. Try pasting the text instead.";
const EMPTY_MESSAGE = "That file looks empty.";
const UNREADABLE_MESSAGE = "Could not read that file. Please try again.";
const WRONG_TYPE_MESSAGE = "Pick a .txt or .md file, or paste the text instead.";

function hasAllowedExtension(name: string): boolean {
  const lower = name.trim().toLowerCase();
  // A provider that hands back no name at all (some Android document
  // providers) is NOT refused on that basis: the size and emptiness checks
  // below still apply, and refusing a file the member just chose because its
  // display name was missing would be a dead end with no way out.
  if (!lower) return true;
  return IMPORT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Open the system picker, read the chosen `.txt`/`.md` and hand back its
 * text. Never throws: a cancel is `cancelled` and every failure is an
 * `error` with the web's own words, because the caller renders it as copy.
 */
export async function pickProgramTextFile(): Promise<PickedImportFile> {
  let picked: PickSingleFileResult;
  try {
    picked = await File.pickFileAsync({ mimeTypes: IMPORT_FILE_MIME_TYPES });
  } catch {
    return { status: "error", message: UNREADABLE_MESSAGE };
  }
  if (!picked || picked.canceled || !picked.result) {
    return { status: "cancelled" };
  }
  const file = picked.result;
  const name = typeof file.name === "string" ? file.name : "";
  if (!hasAllowedExtension(name)) {
    return { status: "error", message: WRONG_TYPE_MESSAGE };
  }
  // The web checks `file.size` BEFORE reading, and so does this: a 40MB video
  // somebody picked by mistake must not be pulled into memory first.
  const size = typeof file.size === "number" ? file.size : 0;
  if (size > MAX_IMPORT_FILE_BYTES) {
    return { status: "error", message: TOO_LARGE_MESSAGE };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { status: "error", message: UNREADABLE_MESSAGE };
  }
  if (!text || !text.trim()) {
    return { status: "error", message: EMPTY_MESSAGE };
  }
  return { status: "ok", text, name };
}
