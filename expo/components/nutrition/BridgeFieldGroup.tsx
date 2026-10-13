import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { convert, familyOf, parseQuantityString } from "@/lib/nutrition/units";

/**
 * ─── Bridge fields, the web's own shape (NP-269) ────────────────────────────
 *
 * Native port of `webapp/components/nutrition/BridgeFieldGroup.tsx`: two
 * freeform text inputs — "Weight per serving (optional)" and "Volume per
 * serving (optional)" — that accept ANY unit in their family ("3.5 oz",
 * "100 g", "1 cup", "8 fl oz") and commit to CANONICAL grams / millilitres on
 * blur via `parseQuantityString` + `convert` (`@become/core`, the same
 * module the web's `lib/units.ts` wraps). A muted readout under each field
 * shows the canonical equivalent ("= 100 g") once it parses.
 *
 * Replaces the native-only "Grams / serving" + "ml / serving" + "Save
 * bridge" button trio, which read nothing like the web and forced a numeric-
 * only entry (no "3.5 oz", no "1 cup").
 */

export interface BridgeValues {
  /** Canonical: grams in one serving. */
  gramsPerServing?: number;
  /** Canonical: millilitres in one serving. */
  mlPerServing?: number;
}

export interface BridgeFieldGroupProps {
  value: BridgeValues;
  /** Called whenever the user commits a change (blur). */
  onChange: (next: BridgeValues) => void;
  servingUnit?: string;
  testID?: string;
}

function roundForReadout(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

function formatInitial(family: "mass" | "volume", value?: number): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  const unit = family === "mass" ? "g" : "ml";
  return `${roundForReadout(value)} ${unit}`;
}

interface ParseResult {
  grams?: number;
  ml?: number;
  invalid?: boolean;
}

function parseEntry(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return {};
  const parsed = parseQuantityString(trimmed);
  if (!parsed) return { invalid: true };
  const family = familyOf(parsed.unit);
  if (family === "mass") return { grams: convert(parsed.value, parsed.unit, "g") };
  if (family === "volume") return { ml: convert(parsed.value, parsed.unit, "ml") };
  return { invalid: true };
}

export function BridgeFieldGroup({
  value,
  onChange,
  testID = "bridge-field-group",
}: BridgeFieldGroupProps) {
  const [massText, setMassText] = useState<string>(() =>
    formatInitial("mass", value.gramsPerServing),
  );
  const [volText, setVolText] = useState<string>(() =>
    formatInitial("volume", value.mlPerServing),
  );
  const [massError, setMassError] = useState<string | null>(null);
  const [volError, setVolError] = useState<string | null>(null);

  useEffect(() => {
    // Re-hydrates from the parent's canonical value — itself set from a
    // network refetch after a successful PATCH, never from this component's
    // own render — so the field reflects what the server actually saved
    // rather than staying stuck on the pre-commit draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMassText(formatInitial("mass", value.gramsPerServing));
    setMassError(null);
  }, [value.gramsPerServing]);
  useEffect(() => {
    // Same as above, for the volume field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVolText(formatInitial("volume", value.mlPerServing));
    setVolError(null);
  }, [value.mlPerServing]);

  const commit = (nextMass: string, nextVol: string) => {
    let grams = value.gramsPerServing;
    let ml = value.mlPerServing;
    let nextMassErr: string | null = null;
    let nextVolErr: string | null = null;
    let normalizedMass = nextMass;
    let normalizedVol = nextVol;

    if (nextMass.trim() === "") {
      grams = undefined;
    } else {
      const r = parseEntry(nextMass);
      if (r.grams != null) {
        grams = r.grams;
        normalizedMass = formatInitial("mass", r.grams);
      } else if (r.ml != null) {
        ml = r.ml;
        normalizedMass = "";
        normalizedVol = formatInitial("volume", r.ml);
      } else if (r.invalid) {
        nextMassErr = "Include a unit (g, oz, lb, etc.)";
      }
    }

    if (nextVol.trim() === "" && normalizedVol === nextVol) {
      ml = undefined;
    } else if (normalizedVol === nextVol) {
      const r = parseEntry(nextVol);
      if (r.ml != null) {
        ml = r.ml;
        normalizedVol = formatInitial("volume", r.ml);
      } else if (r.grams != null) {
        grams = r.grams;
        normalizedVol = "";
        normalizedMass = formatInitial("mass", r.grams);
      } else if (r.invalid) {
        nextVolErr = "Include a unit (ml, cup, fl oz, etc.)";
      }
    }

    setMassText(normalizedMass);
    setVolText(normalizedVol);
    setMassError(nextMassErr);
    setVolError(nextVolErr);
    if (
      (grams ?? null) !== (value.gramsPerServing ?? null) ||
      (ml ?? null) !== (value.mlPerServing ?? null)
    ) {
      onChange({ gramsPerServing: grams, mlPerServing: ml });
    }
  };

  const massPreview = massText.trim() ? parseEntry(massText) : null;
  const volPreview = volText.trim() ? parseEntry(volText) : null;

  return (
    <View testID={testID} style={{ gap: 12 }}>
      <View>
        <Input
          testID={`${testID}-weight`}
          label="Weight per serving (optional)"
          placeholder="e.g. 100 g"
          value={massText}
          onChangeText={setMassText}
          onBlur={() => commit(massText, volText)}
          error={massError ?? undefined}
        />
        {!massError && massPreview?.grams != null ? (
          <Text
            testID={`${testID}-weight-readout`}
            className="text-muted-foreground text-[11px] mt-1"
          >
            {`= ${roundForReadout(massPreview.grams)} g`}
          </Text>
        ) : !massError ? (
          <Text className="text-muted-foreground text-[11px] mt-1">
            e.g. g, oz, lb
          </Text>
        ) : null}
      </View>

      <View>
        <Input
          testID={`${testID}-volume`}
          label="Volume per serving (optional)"
          placeholder="e.g. 1 cup"
          value={volText}
          onChangeText={setVolText}
          onBlur={() => commit(massText, volText)}
          error={volError ?? undefined}
        />
        {!volError && volPreview?.ml != null ? (
          <Text
            testID={`${testID}-volume-readout`}
            className="text-muted-foreground text-[11px] mt-1"
          >
            {`= ${roundForReadout(volPreview.ml)} ml`}
          </Text>
        ) : !volError ? (
          <Text className="text-muted-foreground text-[11px] mt-1">
            e.g. cup, ml, fl oz
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default BridgeFieldGroup;
