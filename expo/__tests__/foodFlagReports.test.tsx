import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
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

jest.mock("@/lib/media/capture", () => {
  const actual = jest.requireActual("@/lib/media/capture");
  return { ...actual, captureImage: jest.fn() };
});

jest.mock("@/lib/media/upload", () => {
  const actual = jest.requireActual("@/lib/media/upload");
  return { ...actual, uploadFoodFlagImage: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { captureImage } from "@/lib/media/capture";
import { uploadFoodFlagImage } from "@/lib/media/upload";
import { FlagFoodSheet } from "@/components/nutrition/FlagFoodSheet";
import { FoodReportsSheet } from "@/components/nutrition/FoodReportsSheet";
import { FoodReportsBadge } from "@/components/nutrition/FoodReportsBadge";
import { EvidencePhotoPicker } from "@/components/nutrition/EvidencePhotoPicker";
import {
  addReportEvidence,
  applyLogCorrection,
  fileFoodFlag,
  loadMyReports,
  markReportsRead,
} from "@/lib/nutrition/foodFlags";

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockCapture = captureImage as unknown as jest.Mock;
const mockUpload = uploadFoodFlagImage as unknown as jest.Mock;

const FOOD_ID = "6512c0ffee00000000000001";

beforeEach(() => {
  jest.clearAllMocks();
  mockCapture.mockResolvedValue({
    status: "captured",
    image: { uri: "file://a.jpg", mimeType: "image/jpeg", fileName: "photo.jpg" },
  });
  mockUpload.mockResolvedValue({
    status: "uploaded",
    imageUrl: "/api/blob/food-flags/u/a.jpg",
  });
});

describe("foodFlags lib (NP-174)", () => {
  it("files a flag with two photos via POST /api/nutrition/foods/{id}/flag (e015ca8d)", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      flagId: "flag-1",
      message: "Thanks — we will check this.",
    });
    const res = await fileFoodFlag({
      foodId: FOOD_ID,
      kinds: ["calories", "macros"],
      note: "label says 190",
      photoUrls: ["/api/blob/food-flags/u/a.jpg", "/api/blob/food-flags/u/b.jpg"],
      jwt: "test-jwt",
    });
    expect(res).toEqual({
      status: "filed",
      flagId: "flag-1",
      message: "Thanks — we will check this.",
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, , init] = mockApiFetch.mock.calls[0];
    expect(path).toBe(`/api/nutrition/foods/${FOOD_ID}/flag`);
    expect(init.method).toBe("POST");
    const body = init.body as Record<string, unknown>;
    // `kind` stays for compatibility; `kinds` carries the full selection.
    expect(body.kind).toBe("calories");
    expect(body.kinds).toEqual(["calories", "macros"]);
    expect(body.note).toBe("label says 190");
    expect(body.photoUrls).toEqual([
      "/api/blob/food-flags/u/a.jpg",
      "/api/blob/food-flags/u/b.jpg",
    ]);
    expect(body.photoUrl).toBe("/api/blob/food-flags/u/a.jpg");
  });

  it("flagging never changes the food other members see (e015ca8e)", async () => {
    // The flag body carries kinds/note/photos only — no nutrition, no Food
    // write. The member's own log is corrected through a separate PATCH on
    // their own meal-log item.
    mockApiFetch.mockResolvedValueOnce({ ok: true, flagId: "flag-1" });
    await fileFoodFlag({ foodId: FOOD_ID, kinds: ["calories"], jwt: "t" });
    const [, , flagInit] = mockApiFetch.mock.calls[0];
    const flagBody = flagInit.body as Record<string, unknown>;
    expect(flagBody).not.toHaveProperty("nutrition");
    expect(flagBody).not.toHaveProperty("food");
    expect(String(mockApiFetch.mock.calls[0][0])).not.toMatch(
      /\/api\/nutrition\/foods\/[^/]+$/,
    );

    mockApiFetch.mockResolvedValueOnce({ success: true });
    const applied = await applyLogCorrection({
      logId: "log-1",
      itemId: "item-1",
      correction: { calories: 190, protein: 20, carbs: 5, fats: 8, fiber: 2 },
      jwt: "t",
    });
    expect(applied).toEqual({ status: "applied" });
    const [patchPath, , patchInit] = mockApiFetch.mock.calls[1];
    expect(patchPath).toBe("/api/meal-logs/log-1/items/item-1");
    expect(patchInit.method).toBe("PATCH");
    expect((patchInit.body as Record<string, unknown>).nutrition).toEqual({
      calories: 190,
      protein: 20,
      carbs: 5,
      fats: 8,
      fiber: 2,
    });
  });

  it("loads my reports and marks them read", async () => {
    mockApiFetch.mockResolvedValueOnce({
      items: [
        {
          id: "flag-1",
          foodId: FOOD_ID,
          food: { name: "Protein Bar" },
          status: "confirmed",
          kinds: ["calories"],
          photoCount: 2,
          rounds: 1,
          escalated: false,
          unread: true,
          canAddEvidence: true,
        },
      ],
      unreadCount: 1,
    });
    const loaded = await loadMyReports({ jwt: "t" });
    expect(loaded.status).toBe("loaded");
    if (loaded.status === "loaded") {
      expect(loaded.unreadCount).toBe(1);
      expect(loaded.items[0]?.food.name).toBe("Protein Bar");
    }
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/nutrition/flags/mine",
      expect.anything(),
      expect.objectContaining({ baseUrl: expect.any(String) }),
    );

    mockApiFetch.mockResolvedValueOnce({ ok: true });
    const marked = await markReportsRead({ jwt: "t" });
    expect(marked).toEqual({ status: "marked" });
    const [, , markInit] = mockApiFetch.mock.calls[1];
    expect(markInit.method).toBe("POST");
  });

  it("sends second-chance evidence with photos", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });
    const res = await addReportEvidence({
      reportId: "flag-1",
      photoUrls: ["/api/blob/food-flags/u/c.jpg"],
      jwt: "t",
    });
    expect(res).toEqual({ status: "sent" });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/nutrition/flags/flag-1/evidence",
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("<FlagFoodSheet /> (NP-174)", () => {
  const baseProps = {
    visible: true,
    foodId: FOOD_ID,
    foodName: "Protein Bar",
    token: "test-jwt",
    onClose: jest.fn(),
  };

  it("files a flag with two photos and shows the success state (e015ca8d)", async () => {
    const fileImpl = jest.fn().mockResolvedValue({
      status: "filed",
      flagId: "flag-1",
      message: "Thanks — we will check this.",
    });
    const { getByTestId } = render(
      <FlagFoodSheet {...baseProps} fileImpl={fileImpl as never} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId("flag-food-kind-macros"));
    });
    await act(async () => {
      fireEvent.changeText(getByTestId("flag-food-note"), "label says 190");
    });
    await act(async () => {
      fireEvent.press(getByTestId("flag-food-submit"));
    });

    await waitFor(() => {
      expect(fileImpl).toHaveBeenCalledTimes(1);
    });
    expect(fileImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        foodId: FOOD_ID,
        kinds: ["calories", "macros"],
        note: "label says 190",
      }),
    );
    await waitFor(() => {
      expect(getByTestId("flag-food-success")).toBeTruthy();
    });
  });

  it("offers the log-correction panel without touching the shared food (e015ca8e)", async () => {
    const onApplyToLog = jest.fn();
    const { getByTestId } = render(
      <FlagFoodSheet
        {...baseProps}
        currentNutrition={{ calories: 190, protein: 20, carbs: 5, fats: 8, fiber: 2 }}
        onApplyToLog={onApplyToLog}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId("flag-food-fix-entry"));
    });
    expect(getByTestId("flag-fix-calories")).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(getByTestId("flag-fix-calories"), "195");
    });
    await act(async () => {
      fireEvent.press(getByTestId("flag-fix-apply"));
    });
    expect(onApplyToLog).toHaveBeenCalledTimes(1);
    // The correction goes to the member's own log — the flag route is never hit.
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onApplyToLog).toHaveBeenCalledWith(
      expect.objectContaining({ calories: 195 }),
    );
  });

  // NP-275: native printed "Something look wrong?" TWICE — once as the
  // sheet's own title, once again inline right under it — while the web has
  // one header (title + warning icon) and an explicit X. The X, the web's
  // Cancel + "Report it" footer and its copy were all missing too.
  it("prints the header once, with an X close, and the web's Cancel + Report it footer (NP-275)", () => {
    const onClose = jest.fn();
    const { getByTestId, getByText, queryAllByText } = render(
      <FlagFoodSheet {...baseProps} onClose={onClose} />,
    );

    // One header, not two.
    expect(queryAllByText("Something look wrong?")).toHaveLength(1);

    // The explicit X closes the sheet, same as the backdrop tap.
    fireEvent.press(getByTestId("flag-food-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Cancel + an amber "Report it", not a single "Send report".
    expect(getByTestId("flag-food-cancel")).toBeTruthy();
    expect(getByText("Report it")).toBeTruthy();

    // The web's copy, byte for byte.
    expect(
      getByTestId("flag-food-note").props.placeholder,
    ).toBe("e.g. my label says 45 cal per container");
    expect(getByText("Anything else? (optional)")).toBeTruthy();
  });

  it("pressing Cancel closes the sheet without filing a report (NP-275)", async () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <FlagFoodSheet {...baseProps} onClose={onClose} />,
    );
    await act(async () => {
      fireEvent.press(getByTestId("flag-food-cancel"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("the evidence picker reads 'Upload photo' here, not the default 'Choose photo' (NP-275)", () => {
    const { getByText, queryByText } = render(<FlagFoodSheet {...baseProps} />);
    expect(getByText("Upload photo")).toBeTruthy();
    expect(queryByText("Choose photo")).toBeNull();
  });
});

describe("<FoodReportsSheet /> + <FoodReportsBadge /> (NP-174)", () => {
  const report = {
    id: "flag-1",
    foodId: FOOD_ID,
    food: { name: "Protein Bar" },
    status: "confirmed",
    kinds: ["calories"],
    resolution: "We checked and did not change the record.",
    photoCount: 2,
    rounds: 1,
    escalated: false,
    unread: true,
    canAddEvidence: true,
  };

  it("lists my reports and marks them read on open", async () => {
    const loadImpl = jest.fn().mockResolvedValue({
      status: "loaded",
      items: [report],
      unreadCount: 1,
    });
    const markReadImpl = jest.fn().mockResolvedValue({ status: "marked" });
    const { getByTestId } = render(
      <FoodReportsSheet
        visible
        onClose={jest.fn()}
        token="test-jwt"
        loadImpl={loadImpl as never}
        markReadImpl={markReadImpl as never}
      />,
    );
    await waitFor(() => {
      expect(loadImpl).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(getByTestId("food-reports-row-flag-1")).toBeTruthy();
    });
    expect(markReadImpl).toHaveBeenCalledTimes(1);
    expect(getByTestId("food-reports-unread-flag-1")).toBeTruthy();
  });

  it("shows the unread-outcomes badge with its count", async () => {
    const loadImpl = jest.fn().mockResolvedValue({
      status: "loaded",
      items: [report],
      unreadCount: 2,
    });
    const { getByTestId } = render(
      <FoodReportsBadge
        token="test-jwt"
        onOpen={jest.fn()}
        loadImpl={loadImpl as never}
      />,
    );
    await waitFor(() => {
      expect(getByTestId("food-reports-badge-count")).toBeTruthy();
    });
  });

  it("capture + upload seam attaches photos through the flag image route", async () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <EvidencePhotoPicker photos={[]} onChange={onChange} />,
    );
    expect(getByTestId("evidence-photos-take-photo")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId("evidence-photos-take-photo"));
    });
    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });
    expect(onChange).toHaveBeenCalledWith(["/api/blob/food-flags/u/a.jpg"]);
  });
});
