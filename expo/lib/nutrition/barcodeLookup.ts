import { apiFetch, FoodBarcodeResponseSchema } from "@become/api-client";
import type { Food, FoodBarcodeResponse } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * Native barcode lookup (NP-088).
 *
 * The web scans with the camera, then `GET /api/nutrition/foods/barcode?code=`
 * (`webapp/components/nutrition/FoodSearchModal.tsx#handleBarcodeDetected`):
 * our foods first, then OpenFoodFacts imported server-side on hit, then USDA.
 * A miss is `{ food: null }` with a 200 — "nothing is keyed on this barcode"
 * is an answer, not an error — and a failed import comes back as a
 * `persistable: false` preview the client must never create a Food for.
 *
 * This is that lookup, minus the camera: one code in, the server's answer out.
 * The client never creates a Food for a scanned code — the lookup materialises
 * OpenFoodFacts rows through the server's ungated import.
 */

export interface BarcodeLookupResult {
  /** The scanned code, trimmed, exactly as sent to the server. */
  code: string;
  /** The server's food, or null on a miss. */
  food: Food | null;
}

/** The web's miss copy, verbatim. */
export function barcodeMissMessage(code: string): string {
  return `No food found for barcode ${code}. Try searching by name.`;
}

/** The web's failure copy, verbatim. */
export const BARCODE_LOOKUP_FAILED_MESSAGE =
  "Barcode lookup failed. Try searching by name.";

/**
 * Look a scanned code up on the server. Resolves — it never rejects — with
 * the food or with the sentence the web shows for a miss / a failure.
 */
export async function lookupBarcode(
  rawCode: string,
  getToken: () => string | undefined,
  fetchImpl?: typeof apiFetch,
): Promise<
  | { status: "found"; code: string; food: Food }
  | { status: "miss"; code: string; message: string }
  | { status: "failed"; code: string; message: string }
> {
  const code = rawCode.trim();
  const fetch = fetchImpl ?? apiFetch;
  try {
    const data: FoodBarcodeResponse = await fetch(
      `/api/nutrition/foods/barcode?code=${encodeURIComponent(code)}`,
      FoodBarcodeResponseSchema,
      { baseUrl: WEBAPP_BASE_URL, getToken },
    );
    if (data?.food) {
      return { status: "found", code, food: data.food };
    }
    return { status: "miss", code, message: barcodeMissMessage(code) };
  } catch {
    return { status: "failed", code, message: BARCODE_LOOKUP_FAILED_MESSAGE };
  }
}

/**
 * The barcode formats the web's reader accepts
 * (`webapp/components/nutrition/BarcodeScanner.tsx` ZXing hints), mapped to
 * `expo-camera`'s `BarcodeType` names. `CameraView` fires `onBarcodeScanned`
 * only for types in `barcodeScannerSettings.barcodeTypes`, so this list is
 * what keeps a scan the web reads working natively.
 */
export const BARCODE_SCANNER_TYPES = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "qr",
  "datamatrix",
] as const;

export type BarcodeScannerType = (typeof BARCODE_SCANNER_TYPES)[number];

/**
 * Debounce duplicate reads: the camera fires `onBarcodeScanned` every frame
 * the code stays in view, and the web stops its reader after the first hit
 * (`BarcodeScanner.tsx#handleDetected`). A repeat of the same code within the
 * window is swallowed; anything else passes through.
 */
export function shouldAcceptScan(
  data: string,
  last: { code: string; at: number } | null,
  now: number,
  windowMs = 2500,
): boolean {
  if (!data) return false;
  if (last && last.code === data && now - last.at < windowMs) return false;
  return true;
}
