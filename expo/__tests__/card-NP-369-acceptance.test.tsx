// NP-369 — SPACING/TYPE: WORKOUT NOW SHEET & GENERATE MODAL.
//
// Diff pass (native vs web, build 24f4e34d) on
// `expo/components/workout/WorkoutNowSheet.tsx` and
// `expo/components/programs/GenerateSheet.tsx`:
//
//   1. The web dialog's container padding is 24px (`p-6`); the shared
//      `BottomSheet` primitive's own default is 20px (`p-5`).
//   2. `GenerateModal`'s tab control is a segmented PILL — a shared
//      `rounded-2xl bg-zinc-100 p-1` track with the selected option lifted
//      onto its own `bg-white`/`bg-zinc-900` chip in `mindset` purple — not
//      a solid `mindset`/`muted` fill across the whole tab.
//   3. `GenerateModal`'s Focus/Equipment chips are `rounded-full px-3 py-1.5
//      text-sm` pills — py-1.5 is 6px, not the 8px native carried before.
//   4. `GenerateModal`'s AI section is its own purple-tinted card
//      (`border-purple-200 bg-purple-50/60`, purple title/icon), not the
//      neutral border/card surface every other card on the sheet uses.
//
// This file pins the gap closed without re-litigating NP-294/NP-295's own
// acceptance tests (colour classes from NativeWind are not resolved under
// jest; plain `style` objects are, so these assertions read those).

/* eslint-disable import/first */
import { render } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "member@example.com" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { GenerateSheet } from "@/components/programs/GenerateSheet";
/* eslint-enable import/first */

function flatten(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style as Record<string, unknown>) ?? {};
}

describe("(id: b1) the sheet container carries the web's 24px padding", () => {
  it("WorkoutNowSheet overrides the shared sheet's default 20px to 24px", () => {
    const { getByTestId } = render(<WorkoutNowSheet visible onClose={() => {}} />);
    const style = flatten(getByTestId("workout-now-sheet-sheet").props.style);
    expect(style.paddingLeft).toBe(24);
    expect(style.paddingRight).toBe(24);
    expect(style.paddingTop).toBe(24);
  });

  it("GenerateSheet overrides the shared sheet's default 20px to 24px", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const style = flatten(getByTestId("generate-sheet-sheet").props.style);
    expect(style.paddingLeft).toBe(24);
    expect(style.paddingRight).toBe(24);
    expect(style.paddingTop).toBe(24);
  });
});

describe("(id: b2) the Session/Program tabs are a segmented pill, not a solid fill", () => {
  it("the track is a single rounded-2xl bg-muted container with p-1", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const track = flatten(getByTestId("generate-sheet-tabs").props.style);
    expect(track.borderRadius).toBe(16);
    expect(track.padding).toBe(4);
  });

  it("the selected tab lifts onto its own chip rather than filling solid", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const selected = flatten(getByTestId("generate-sheet-tab-session").props.style);
    const unselected = flatten(getByTestId("generate-sheet-tab-program").props.style);
    expect(selected.paddingVertical).toBe(8);
    // The web's inactive option sits transparent on the shared track; a
    // solid `colors.muted` fill (the pre-NP-369 shape) would read false here.
    expect(unselected.backgroundColor).toBe("transparent");
    expect(selected.backgroundColor).not.toBe("transparent");
  });
});

describe("(id: b3) Focus/Equipment chips carry the web's py-1.5 (6px), not 8px", () => {
  it("a focus chip's vertical padding is 6", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const chip = flatten(getByTestId("generate-sheet-focus-full_body").props.style);
    expect(chip.paddingVertical).toBe(6);
  });

  it("an equipment chip's vertical padding is 6", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const chip = flatten(getByTestId("generate-sheet-equipment-dumbbell").props.style);
    expect(chip.paddingVertical).toBe(6);
  });
});

describe("(id: b4) the AI section carries the web's own purple tint", () => {
  it("is not the neutral border/card every other card on the sheet uses", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const aiSection = flatten(getByTestId("generate-sheet-ai-section").props.style);
    // `tint()` always answers an alpha'd `rgba(...)`; the plain `colors.card`
    // this carried before is an opaque `rgb(...)` with no alpha channel.
    expect(String(aiSection.backgroundColor)).toMatch(/^rgba\(/);
    expect(String(aiSection.borderColor)).toMatch(/^rgba\(/);
  });
});
